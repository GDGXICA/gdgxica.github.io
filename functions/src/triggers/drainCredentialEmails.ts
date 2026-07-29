import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  RESEND_API_KEY,
  RESEND_FROM,
} from "../config";
import { writeAuditLog } from "../utils/audit";
import { sendCredentialEmail } from "../services/credentialEmail";
import { readCredentialImage } from "../services/credentialStorage";
import { readEmailTransport } from "../services/emailSettings";
import { dailyCapFor } from "../services/emailTransport";
import {
  BATCH,
  budgetDocId,
  computeBackoff,
  hasAttemptsLeft,
  isLeaseStale,
  remainingBudget,
} from "../services/credentialQueue";

const SITE_ORIGIN = "https://gdgica.com";

interface CredentialDoc {
  email?: string;
  firstName?: string;
  groupLetter?: string;
  credentialImagePath?: string | null;
  emailStatus?: string;
  emailTemplate?: string;
  emailAttempts?: number;
  emailLastAttemptAt?: Timestamp | null;
}

/**
 * Drains the credential email queue every five minutes.
 *
 * A scheduled function must declare its own secrets — the `secrets` array
 * on the `api` onRequest function does NOT extend to other exports, and
 * omitting them here fails at send time with an empty Gmail password
 * rather than at deploy time.
 */
export const drainCredentialEmails = onSchedule(
  {
    schedule: "*/5 * * * *",
    timeZone: "America/Lima",
    // Both transports declare their secrets: which one is used is a
    // runtime setting, so the function must be able to reach either.
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, RESEND_API_KEY, RESEND_FROM],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    const budgetRef = db
      .collection("credential_email_budget")
      .doc(budgetDocId(now));
    const transport = await readEmailTransport();
    // The ceiling belongs to the transport, not to us: Resend's free tier
    // stops at 100 messages a day, Gmail tolerates far more. Reading it
    // here means flipping the switch in the panel also moves the budget.
    const cap = dailyCapFor(transport);

    const budgetSnap = await budgetRef.get();
    const sentToday = (budgetSnap.data()?.sent as number | undefined) ?? 0;

    let remaining = remainingBudget(sentToday, cap);
    if (remaining === 0) {
      logger.warn("Credential email budget exhausted for today", {
        sentToday,
        cap,
        transport,
      });
      return;
    }

    // COLLECTION_GROUP so one run covers every event. Ordering by the
    // next-attempt time makes this a priority queue: retries with a long
    // backoff naturally yield to fresh registrations.
    const due = await db
      .collectionGroup("credentials")
      .where("emailStatus", "==", "queued")
      .where("emailNextAttemptAt", "<=", Timestamp.fromDate(now))
      .orderBy("emailNextAttemptAt")
      .limit(BATCH)
      .get();

    let claimed = 0;
    let sent = 0;
    let failed = 0;
    let parked = 0;

    // Serial, NOT the CONCURRENCY = 4 pattern from certificates.ts. Being
    // gentle with Gmail is the entire point of this trigger; 40 per run
    // every 5 minutes is 480/hour, far above any plausible arrival rate.
    for (const docSnap of due.docs) {
      if (remaining === 0) break;

      const ref = docSnap.ref;
      const eventSlug = ref.parent.parent?.id ?? "";

      // Claim in a transaction so a manual re-trigger, or two overlapping
      // runs, cannot send the same credential twice.
      const data = await claim(db, ref, now);
      if (!data) continue;
      claimed++;

      try {
        const image = data.credentialImagePath
          ? await readCredentialImage(data.credentialImagePath)
          : null;

        await sendCredentialEmail({
          to: data.email ?? "",
          firstName: data.firstName ?? "",
          eventName: await readEventName(db, eventSlug),
          groupLetter: data.groupLetter ?? "",
          registrationUrl: await readRegistrationUrl(db, eventSlug),
          image,
          // Mapped explicitly rather than cast: an unknown value must
          // fall back to the credential email, never be passed through.
          // Before the reminder existed this collapsed everything that was
          // not photo_removed into "credential", which would have sent a
          // queued reminder the wrong message with the card re-attached.
          template:
            data.emailTemplate === "photo_removed"
              ? "photo_removed"
              : data.emailTemplate === "reminder"
                ? "reminder"
                : "credential",
          credentialPageUrl: `${SITE_ORIGIN}/events/${eventSlug}/credencial`,
          transport,
        });

        await ref.update({
          emailStatus: "sent",
          emailSentAt: FieldValue.serverTimestamp(),
          emailLastError: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await budgetRef.set({ sent: FieldValue.increment(1) }, { merge: true });
        sent++;
        remaining--;
      } catch (err) {
        const attempts = (data.emailAttempts ?? 0) + 1;
        const message = String(err instanceof Error ? err.message : err).slice(
          0,
          300
        );

        if (hasAttemptsLeft(attempts)) {
          const delay = computeBackoff(attempts);
          await ref.update({
            emailStatus: "queued",
            emailNextAttemptAt: Timestamp.fromMillis(
              now.getTime() + delay * 1000
            ),
            emailLastError: message,
            updatedAt: FieldValue.serverTimestamp(),
          });
          failed++;
        } else {
          // Parked, not retried forever. Surfaced in the admin panel with a
          // manual retry button.
          await ref.update({
            emailStatus: "failed",
            emailLastError: message,
            updatedAt: FieldValue.serverTimestamp(),
          });
          parked++;
        }
      }
    }

    // ONE audit entry per run. Per-email rows would add ~350 documents to
    // audit_log for a single event and drown every other action in it.
    await writeAuditLog({
      action: "credential_email.drain",
      performedBy: "system",
      targetId: budgetDocId(now),
      targetType: "credential_email_budget",
      details: {
        due: due.size,
        claimed,
        sent,
        failed,
        parked,
        remaining,
        transport,
      },
      timestamp: FieldValue.serverTimestamp(),
    });
  }
);

/**
 * Flips a queued document to `sending` and returns its data.
 *
 * Returns null when another run already took it. The lease is what makes
 * the claim safe against overlapping invocations; isLeaseStale reclaims a
 * document abandoned in `sending` by a crashed run.
 */
async function claim(
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference,
  now: Date
): Promise<CredentialDoc | null> {
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as CredentialDoc | undefined;
      if (!data) return null;

      const status = data.emailStatus;
      const stale =
        status === "sending" &&
        isLeaseStale(data.emailLastAttemptAt?.toDate() ?? null, now);

      if (status !== "queued" && !stale) return null;
      if (!data.email) return null;

      tx.update(ref, {
        emailStatus: "sending",
        emailAttempts: FieldValue.increment(1),
        emailLastAttemptAt: FieldValue.serverTimestamp(),
      });
      return data;
    });
  } catch (err) {
    logger.warn("Credential email claim failed", { path: ref.path, err });
    return null;
  }
}

async function readEventName(
  db: admin.firestore.Firestore,
  slug: string
): Promise<string> {
  if (!slug) return "GDG ICA";
  const snap = await db.collection("events").doc(slug).get();
  return (snap.data()?.title as string | undefined) || slug;
}

async function readRegistrationUrl(
  db: admin.firestore.Firestore,
  slug: string
): Promise<string> {
  if (!slug) return SITE_ORIGIN;
  const snap = await db.collection("events").doc(slug).get();
  return (
    (snap.data()?.registration_url as string | undefined) ||
    `${SITE_ORIGIN}/events/${slug}`
  );
}
