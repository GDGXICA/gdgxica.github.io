import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  RESEND_API_KEY,
  RESEND_FROM,
} from "../config";
import { writeAuditLog } from "../utils/audit";
import { buildCertificatePdf } from "../services/certificatePdf";
import { sendCertificateEmail } from "../services/certificateEmail";
import {
  missingSettings,
  pdfEventFields,
  type CertificateSettings,
} from "../services/certificateContent";
import { displayName, cleanNamePart } from "../services/certificateName";
import {
  CERTIFICATES,
  checkinSource,
  normalizeEmail,
  type CertificateDoc,
} from "../services/certificateRecords";
import {
  budgetRef,
  certificateSettingsRef,
  kickCertificateDrain,
} from "../services/certificateQueue";
import {
  LEASE_SECONDS,
  computeBackoff,
  hasAttemptsLeft,
  remainingBudget,
} from "../services/credentialQueue";
import { readEmailTransport } from "../services/emailSettings";
import { dailyCapFor, type EmailTransport } from "../services/emailTransport";

// Sends queued certificates.
//
// Runs as a Cloud Tasks function with one dispatch at a time, so only one
// drain ever works the queue: the API enqueues a task when an organizer
// presses "Enviar" (the email leaves within seconds), and a five-minute
// schedule enqueues one when retries or tomorrow's leftovers come due.
//
// Learned from the credential drain, which this mirrors:
// - The claim leaves `nextAttemptAt` at the lease expiry and the query
//   includes `sending`, so a document left behind by a crashed run comes
//   due again by itself. Querying only `queued` strands it forever.
// - The daily budget is shared with credential emails and reserved inside
//   the claim's transaction, so two drains cannot overshoot it, and a
//   failed send gives its slot back.

/** Documents read per query. */
export const CERTIFICATE_BATCH = 25;
/** Pause between sends: gentle with Gmail, about 30 a minute. */
export const SEND_GAP_MS = 2000;
/** Stop claiming well inside the 540 s timeout. */
export const RUN_BUDGET_MS = 450_000;

const DUE_STATUSES = ["queued", "sending"];

export interface DrainDeps {
  db: admin.firestore.Firestore;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  transport?: EmailTransport;
}

export interface DrainResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  budgetExhausted: boolean;
}

type Claim =
  | { kind: "claimed"; doc: CertificateDoc }
  | { kind: "cancelled" }
  | { kind: "budget" }
  | { kind: "skip" };

/**
 * Takes one document for sending, inside a transaction that also reserves
 * a slot of today's budget and, for attendees, re-checks the roster: a
 * check-in undone after queueing cancels the certificate.
 */
async function claim(
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference,
  now: Date,
  cap: number
): Promise<Claim> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.exists ? (snap.data() as CertificateDoc) : null;
    if (!doc) return { kind: "skip" };
    const due =
      doc.status === "queued" ||
      (doc.status === "sending" &&
        (doc.nextAttemptAt?.toMillis() ?? 0) <= now.getTime());
    if (!due) return { kind: "skip" };

    const rosterSnap =
      doc.kind === "attendee" && doc.eventSlug && doc.rosterId
        ? await tx.get(
            db
              .collection("events")
              .doc(doc.eventSlug)
              .collection("roster")
              .doc(doc.rosterId)
          )
        : null;
    const budgetSnap = await tx.get(budgetRef(now, db));

    let identity: Partial<CertificateDoc> = {};
    if (rosterSnap) {
      const row = rosterSnap.data();
      if (!rosterSnap.exists || !row || !checkinSource(row)) {
        tx.update(ref, {
          status: "cancelled",
          nextAttemptAt: null,
          lastError: "Ya no tiene check-in.",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { kind: "cancelled" };
      }
      // A Bevy re-import may have corrected the name or email since the
      // certificate was queued; an organizer's own correction wins.
      if (!doc.overridden) {
        const first = typeof row.firstName === "string" ? row.firstName : "";
        const last = typeof row.lastName === "string" ? row.lastName : "";
        identity = {
          firstName: cleanNamePart(first),
          lastName: cleanNamePart(last),
          name: displayName(first, last),
          email: normalizeEmail(typeof row.email === "string" ? row.email : ""),
        };
      }
    }

    const sentToday = Number(budgetSnap.data()?.sent ?? 0);
    if (remainingBudget(sentToday, cap) === 0) return { kind: "budget" };

    tx.set(
      budgetRef(now, db),
      { sent: FieldValue.increment(1) },
      { merge: true }
    );
    tx.update(ref, {
      ...identity,
      status: "sending",
      attempts: FieldValue.increment(1),
      lastAttemptAt: FieldValue.serverTimestamp(),
      nextAttemptAt: Timestamp.fromMillis(now.getTime() + LEASE_SECONDS * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { kind: "claimed", doc: { ...doc, ...identity } };
  });
}

/** One drain run: sends what is due until the queue, budget or time ends. */
export async function runCertificateDrain(
  deps: DrainDeps
): Promise<DrainResult> {
  const { db } = deps;
  const started = deps.now().getTime();
  const transport = deps.transport ?? (await readEmailTransport());
  const cap = dailyCapFor(transport);
  const settingsCache = new Map<string, CertificateSettings | null>();
  const result: DrainResult = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0,
    budgetExhausted: false,
  };

  const settingsFor = async (
    doc: CertificateDoc
  ): Promise<CertificateSettings | null> => {
    if (doc.source === "manual") return doc.content ?? null;
    const slug = doc.eventSlug ?? "";
    if (!settingsCache.has(slug)) {
      const snap = await certificateSettingsRef(slug, db).get();
      settingsCache.set(
        slug,
        snap.exists ? (snap.data() as CertificateSettings) : null
      );
    }
    return settingsCache.get(slug) ?? null;
  };

  const outOfTime = () => deps.now().getTime() - started > RUN_BUDGET_MS;
  // Documents this run already handled; a retry backed off into the past
  // (or a lease that expires mid-run) must not be picked up twice.
  const handled = new Set<string>();

  while (!outOfTime() && !result.budgetExhausted) {
    const now = deps.now();
    let due: admin.firestore.QuerySnapshot;
    try {
      due = await db
        .collection(CERTIFICATES)
        .where("status", "in", DUE_STATUSES)
        .where("nextAttemptAt", "<=", Timestamp.fromDate(now))
        .orderBy("nextAttemptAt")
        .limit(CERTIFICATE_BATCH)
        .get();
    } catch (err) {
      // Most likely the composite index is still building after a deploy.
      logger.error("Certificate drain query failed", { err });
      break;
    }
    const fresh = due.docs.filter((d) => !handled.has(d.id));
    if (fresh.length === 0) break;

    for (const snap of fresh) {
      if (outOfTime()) break;
      handled.add(snap.id);
      const at = deps.now();
      let claimed: Claim;
      try {
        claimed = await claim(db, snap.ref, at, cap);
      } catch (err) {
        logger.warn("Certificate claim failed", { id: snap.id, err });
        continue;
      }
      if (claimed.kind === "skip") continue;
      if (claimed.kind === "cancelled") {
        result.cancelled++;
        continue;
      }
      if (claimed.kind === "budget") {
        result.budgetExhausted = true;
        break;
      }

      const doc = claimed.doc;
      result.claimed++;
      try {
        const settings = await settingsFor(doc);
        const missing = missingSettings(settings, doc.kind);
        if (!settings || missing.length > 0) {
          throw new Error(
            `Faltan datos del certificado: ${missing.join(", ")}`
          );
        }
        const fields = pdfEventFields(settings, doc.hours);
        const pdf = await buildCertificatePdf({
          kind: doc.kind,
          recipientName: doc.name,
          ...fields,
        });
        await sendCertificateEmail(transport, {
          kind: doc.kind,
          to: doc.email,
          recipientName: doc.name,
          eventName: fields.eventName,
          pdf,
        });
        await snap.ref.update({
          status: "sent",
          sentAt: FieldValue.serverTimestamp(),
          sentContent: { ...settings, hours: fields.hours, name: doc.name },
          nextAttemptAt: null,
          lastError: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        result.sent++;
      } catch (err) {
        // Give the slot back: a message that never left used no quota.
        await budgetRef(at, db)
          .set({ sent: FieldValue.increment(-1) }, { merge: true })
          .catch((e) => logger.warn("Budget release failed", { e }));
        const attempts = (doc.attempts ?? 0) + 1;
        const message = String(err instanceof Error ? err.message : err).slice(
          0,
          300
        );
        if (hasAttemptsLeft(attempts)) {
          await snap.ref.update({
            status: "queued",
            nextAttemptAt: Timestamp.fromMillis(
              at.getTime() + computeBackoff(attempts) * 1000
            ),
            lastError: message,
            updatedAt: FieldValue.serverTimestamp(),
          });
          result.retried++;
        } else {
          await snap.ref.update({
            status: "failed",
            nextAttemptAt: null,
            lastError: message,
            updatedAt: FieldValue.serverTimestamp(),
          });
          result.failed++;
        }
      }
      await deps.sleep(SEND_GAP_MS);
    }
  }

  // One audit row per run that did something; idle runs leave none.
  if (result.claimed > 0 || result.cancelled > 0) {
    await writeAuditLog({
      action: "certificate_email.drain",
      performedBy: "system",
      targetId: CERTIFICATES,
      targetType: "certificate_queue",
      details: { ...result, transport, cap },
    });
  }
  return result;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const drainCertificateEmails = onTaskDispatched(
  {
    region: "us-central1",
    // One drain at a time: the budget and the Gmail connection are shared.
    rateLimits: { maxConcurrentDispatches: 1 },
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 30 },
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    // Both transports declare their secrets: which one is used is a
    // runtime setting.
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, RESEND_API_KEY, RESEND_FROM],
  },
  async () => {
    const result = await runCertificateDrain({
      db: admin.firestore(),
      now: () => new Date(),
      sleep,
    });
    logger.info("Certificate drain finished", result);
  }
);

/**
 * Whether the drain has work: something due, and budget left today. Cheap
 * on purpose (two reads), since it runs every five minutes all year.
 */
export async function certificateDrainHasWork(
  db: admin.firestore.Firestore,
  now: Date
): Promise<boolean> {
  const due = await db
    .collection(CERTIFICATES)
    .where("status", "in", DUE_STATUSES)
    .where("nextAttemptAt", "<=", Timestamp.fromDate(now))
    .limit(1)
    .get();
  if (due.empty) return false;
  const [budget, transport] = await Promise.all([
    budgetRef(now, db).get(),
    readEmailTransport(),
  ]);
  return (
    remainingBudget(Number(budget.data()?.sent ?? 0), dailyCapFor(transport)) >
    0
  );
}

/**
 * Picks up what no button press will: retries after their backoff,
 * leftovers once the daily budget resets, and documents a crashed run
 * left in `sending`.
 */
export const scheduleCertificateDrain = onSchedule(
  { schedule: "*/5 * * * *", timeZone: "America/Lima" },
  async () => {
    try {
      if (await certificateDrainHasWork(admin.firestore(), new Date())) {
        await kickCertificateDrain();
      }
    } catch (err) {
      logger.error("Certificate drain scheduler failed", { err });
    }
  }
);
