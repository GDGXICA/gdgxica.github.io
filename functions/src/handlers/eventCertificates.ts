import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { GITHUB_TOKEN } from "../config";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { writeAuditLog } from "../utils/audit";
import { GitHubService } from "../services/github";
import { buildCertificatePdf } from "../services/certificatePdf";
import {
  deriveSettings,
  missingSettings,
  pdfEventFields,
  type CertificateSettings,
} from "../services/certificateContent";
import type { CertificateKind } from "../services/certificateKinds";
import { cleanNamePart, displayName } from "../services/certificateName";
import {
  CERTIFICATES,
  attendeeCertificateId,
  checkinSource,
  manualCertificateId,
  normalizeEmail,
  personCertificateId,
  type CertificateDoc,
  type CertificateStatus,
  type CheckinSource,
} from "../services/certificateRecords";
import {
  budgetRef,
  certificateSettingsRef,
  kickCertificateDrain,
} from "../services/certificateQueue";
import { readEmailTransport } from "../services/emailSettings";
import { dailyCapFor } from "../services/emailTransport";
import type {
  CertificateCancelBody,
  CertificateEnqueueBody,
  CertificateManualBody,
  CertificatePeopleCreateBody,
  CertificatePersonUpdateBody,
  CertificatePreviewBody,
  CertificateSettingsBody,
} from "../schemas";

// Certificates per event, and manual certificates.
//
// Nothing here sends email. These endpoints decide WHO gets a certificate
// and flip their documents to `queued`; triggers/drainCertificateEmails.ts
// sends them. The old endpoint sent every email inside the request and ran
// into Hosting's 60-second cut-off at around a hundred recipients, losing
// the results and re-sending to everyone on the next click.
//
// Attendees are never taken from the client's word: every id is re-read
// from the roster and must carry a check-in (our panel's or Bevy's). The
// drain checks again right before sending.

/** Firestore transactions allow 500 writes; a chunk stays well under. */
const CHUNK = 200;

const db = () => admin.firestore();
const certificates = () => db().collection(CERTIFICATES);
const rosterOf = (slug: string) =>
  db().collection("events").doc(slug).collection("roster");

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function millis(value: unknown): number | null {
  return value && typeof (value as Timestamp).toMillis === "function"
    ? (value as Timestamp).toMillis()
    : null;
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** What the panel sees of a certificate document. */
export interface CertificateView {
  id: string;
  kind: CertificateKind;
  source: CertificateDoc["source"];
  rosterId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  hours: number | null;
  status: CertificateStatus;
  attempts: number;
  lastError: string | null;
  sentAt: number | null;
  queuedAt: number | null;
  updatedAt: number | null;
  resendCount: number;
  overridden: boolean;
  eventRef: string | null;
  content: CertificateSettings | null;
}

export function toView(id: string, doc: CertificateDoc): CertificateView {
  return {
    id,
    kind: doc.kind,
    source: doc.source,
    rosterId: doc.rosterId ?? null,
    firstName: doc.firstName ?? "",
    lastName: doc.lastName ?? "",
    name: doc.name ?? "",
    email: doc.email ?? "",
    hours: typeof doc.hours === "number" ? doc.hours : null,
    status: doc.status,
    attempts: doc.attempts ?? 0,
    lastError: doc.lastError ?? null,
    sentAt: millis(doc.sentAt),
    queuedAt: millis(doc.queuedAt),
    updatedAt: millis(doc.updatedAt),
    resendCount: doc.resendCount ?? 0,
    overridden: doc.overridden === true,
    eventRef: doc.eventRef ?? null,
    content: doc.content ?? null,
  };
}

function pickSettings(data: Record<string, unknown>): CertificateSettings {
  return {
    eventName: str(data.eventName),
    eventDate: str(data.eventDate),
    startTime: str(data.startTime),
    endTime: str(data.endTime),
    hours: typeof data.hours === "number" ? data.hours : 0,
  };
}

/**
 * The event's certificate settings: the saved ones, or a first draft
 * derived from the event in the data repo. Only an unsaved event costs a
 * GitHub call, so polling the panel never does.
 */
export async function loadSettings(
  slug: string
): Promise<{ settings: CertificateSettings | null; saved: boolean }> {
  const snap = await certificateSettingsRef(slug).get();
  if (snap.exists) {
    return { settings: pickSettings(snap.data() ?? {}), saved: true };
  }
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const file = await github.getFileContentIfExists<Record<string, unknown>>(
      `events/${slug}.json`
    );
    return { settings: file ? deriveSettings(file.data) : null, saved: false };
  } catch (err) {
    logger.warn("Could not derive certificate settings from the event", {
      slug,
      err,
    });
    return { settings: null, saved: false };
  }
}

interface RosterRow {
  firstName: string;
  lastName: string;
  email: string;
  checkin: CheckinSource;
}

const ROSTER_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "checkedIn",
  "bevyCheckinAt",
];

/**
 * Everyone on the roster with a check-in. Two queries rather than one OR:
 * each rides an automatic single-field index, and `!=` inside an OR
 * filter would need composite ones.
 */
async function eligibleRoster(slug: string): Promise<Map<string, RosterRow>> {
  const roster = rosterOf(slug);
  const [panel, bevy] = await Promise.all([
    roster
      .where("checkedIn", "==", true)
      .select(...ROSTER_FIELDS)
      .get(),
    roster
      .where("bevyCheckinAt", "!=", null)
      .select(...ROSTER_FIELDS)
      .get(),
  ]);
  const rows = new Map<string, RosterRow>();
  for (const snap of [...panel.docs, ...bevy.docs]) {
    const data = snap.data();
    const source = checkinSource(data);
    if (!source) continue;
    rows.set(snap.id, {
      firstName: str(data.firstName),
      lastName: str(data.lastName),
      email: normalizeEmail(str(data.email)),
      checkin: source,
    });
  }
  return rows;
}

async function readBudget() {
  const transport = await readEmailTransport();
  const snap = await budgetRef(new Date()).get();
  return {
    sentToday: Number(snap.data()?.sent ?? 0),
    cap: dailyCapFor(transport),
    transport,
  };
}

function eventMismatch(doc: CertificateDoc | null, slug: string): boolean {
  return !doc || doc.eventSlug !== slug;
}

/**
 * GET /api/events/:slug/certificates
 *
 * Everything the event's certificate panel shows. With `?since=<ms>` it
 * returns only the certificate documents changed after that instant: the
 * panel polls with it while something is queued, and re-reading every
 * checked-in attendee every few seconds would cost thousands of reads.
 */
export async function getEventCertificates(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const serverTime = Date.now();
    const since = Number(req.query.since);

    if (Number.isFinite(since) && since > 0) {
      const snap = await certificates()
        .where("eventSlug", "==", slug)
        .where("updatedAt", ">", Timestamp.fromMillis(since))
        .get();
      res.json({
        success: true,
        data: {
          serverTime,
          changes: snap.docs.map((d) =>
            toView(d.id, d.data() as CertificateDoc)
          ),
        },
      });
      return;
    }

    const [{ settings, saved }, roster, certSnap, metaSnap, budget] =
      await Promise.all([
        loadSettings(slug),
        eligibleRoster(slug),
        certificates().where("eventSlug", "==", slug).get(),
        db()
          .collection("events")
          .doc(slug)
          .collection("checkinMeta")
          .doc("current")
          .get(),
        readBudget(),
      ]);

    const docs = new Map(
      certSnap.docs.map((d) => [d.id, d.data() as CertificateDoc])
    );

    const attendees: (CertificateView & { checkin: CheckinSource | null })[] =
      [];
    const listed = new Set<string>();
    for (const [rosterId, row] of roster) {
      const id = attendeeCertificateId(slug, rosterId);
      listed.add(id);
      const doc = docs.get(id);
      const fromRoster = {
        firstName: row.firstName,
        lastName: row.lastName,
        name: displayName(row.firstName, row.lastName),
        email: row.email,
      };
      const view: CertificateView = doc
        ? {
            ...toView(id, doc),
            // A later Bevy import may have corrected the roster; the
            // drain prints the roster's values unless an organizer
            // overrode them, so the panel shows the same.
            ...(doc.overridden ? {} : fromRoster),
          }
        : {
            ...toView(id, {
              eventSlug: slug,
              kind: "attendee",
              source: "roster",
              rosterId,
              status: "pending",
              attempts: 0,
              ...fromRoster,
            }),
          };
      attendees.push({ ...view, rosterId, checkin: row.checkin });
    }
    // Certificates of people whose check-in was undone stay visible: one
    // may already have been sent, and the drain cancels the rest.
    for (const [id, doc] of docs) {
      if (doc.kind === "attendee" && !listed.has(id)) {
        attendees.push({ ...toView(id, doc), checkin: null });
      }
    }

    const people = [...docs]
      .filter(([, doc]) => doc.kind !== "attendee")
      .map(([id, doc]) => toView(id, doc));

    const meta = metaSnap.data() ?? {};
    res.json({
      success: true,
      data: {
        serverTime,
        settings,
        settingsSaved: saved,
        attendees,
        people,
        roster: {
          total: typeof meta.rosterCount === "number" ? meta.rosterCount : null,
          lastImportAt: millis(meta.lastImportAt),
          checkedIn: roster.size,
        },
        budget,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** GET /api/events/:slug/certificates/settings */
export async function getCertificateSettings(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const { settings, saved } = await loadSettings(slug);
    res.json({ success: true, data: { settings, settingsSaved: saved } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** PUT /api/events/:slug/certificates/settings */
export async function saveCertificateSettings(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CertificateSettingsBody;

    await certificateSettingsRef(slug).set({
      ...body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });

    await writeAuditLog(
      {
        action: "certificate.settings",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: {
          eventName: body.eventName,
          eventDate: body.eventDate,
          hours: body.hours,
        },
      },
      req
    );

    res.json({ success: true, data: { settings: body, settingsSaved: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** POST /api/events/:slug/certificates/people — volunteers and speakers. */
export async function addCertificatePeople(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const { kind, people } = req.body as CertificatePeopleCreateBody;

    const unique = new Map<string, (typeof people)[number]>();
    const repeated: { email: string; reason: string }[] = [];
    for (const person of people) {
      const id = personCertificateId(slug, kind, person.email);
      if (unique.has(id)) {
        repeated.push({ email: person.email, reason: "duplicate" });
      } else {
        unique.set(id, person);
      }
    }

    const refs = [...unique.keys()].map((id) => certificates().doc(id));
    const result = await db().runTransaction(async (tx) => {
      const added: CertificateView[] = [];
      const skipped: { email: string; reason: string }[] = [];
      const snaps = await tx.getAll(...refs);
      snaps.forEach((snap, i) => {
        const person = unique.get(refs[i].id)!;
        if (snap.exists) {
          skipped.push({ email: person.email, reason: "duplicate" });
          return;
        }
        const firstName = cleanNamePart(person.firstName);
        const lastName = cleanNamePart(person.lastName);
        const doc: CertificateDoc = {
          eventSlug: slug,
          kind,
          source: "registered",
          rosterId: null,
          firstName,
          lastName,
          name: displayName(firstName, lastName),
          email: normalizeEmail(person.email),
          hours: person.hours ?? null,
          status: "pending",
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
          resendCount: 0,
          createdBy: user.uid,
        };
        tx.set(refs[i], {
          ...doc,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        added.push(toView(refs[i].id, doc));
      });
      return { added, skipped };
    });

    const skipped = [...repeated, ...result.skipped];
    await writeAuditLog(
      {
        action: "certificate.person.add",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: { kind, added: result.added.length, skipped: skipped.length },
      },
      req
    );

    res.json({ success: true, data: { added: result.added, skipped } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * PATCH /api/events/:slug/certificates/:id
 *
 * Corrects a name, email or hours, or excludes/restores someone. An
 * attendee's document is created on first edit (its id is a hash of the
 * roster id, which the body must carry). A volunteer's or speaker's id is
 * derived from their email, so a new email moves the document.
 */
export async function updateCertificatePerson(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CertificatePersonUpdateBody;
    const ref = certificates().doc(id);

    const result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let doc = snap.exists ? (snap.data() as CertificateDoc) : null;
      const isNew = !doc;

      if (doc && eventMismatch(doc, slug)) {
        throw new HttpError(404, "Certificado no encontrado");
      }
      if (!doc) {
        if (!body.rosterId || attendeeCertificateId(slug, body.rosterId) !== id)
          throw new HttpError(404, "Certificado no encontrado");
        const rosterSnap = await tx.get(rosterOf(slug).doc(body.rosterId));
        const r = rosterSnap.data();
        if (!rosterSnap.exists || !r)
          throw new HttpError(404, "Asistente no encontrado");
        doc = {
          eventSlug: slug,
          kind: "attendee",
          source: "roster",
          rosterId: body.rosterId,
          firstName: cleanNamePart(str(r.firstName)),
          lastName: cleanNamePart(str(r.lastName)),
          name: displayName(str(r.firstName), str(r.lastName)),
          email: normalizeEmail(str(r.email)),
          hours: null,
          status: "pending",
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
          resendCount: 0,
          createdBy: user.uid,
        };
      }
      if (doc.status === "sending") {
        throw new HttpError(
          409,
          "Este certificado se está enviando; espera a que termine."
        );
      }

      const next: CertificateDoc = { ...doc };
      const identityChanged =
        body.firstName !== undefined ||
        body.lastName !== undefined ||
        body.email !== undefined;
      if (body.firstName !== undefined)
        next.firstName = cleanNamePart(body.firstName);
      if (body.lastName !== undefined)
        next.lastName = cleanNamePart(body.lastName);
      if (body.email !== undefined) next.email = normalizeEmail(body.email);
      next.name = displayName(next.firstName, next.lastName);
      if (body.hours !== undefined) next.hours = body.hours ?? null;
      if (identityChanged && doc.source === "roster") next.overridden = true;

      if (body.excluded === true) {
        if (doc.status === "sent")
          throw new HttpError(409, "Este certificado ya se envió.");
        next.status = "excluded";
        next.nextAttemptAt = null;
      } else if (body.excluded === false && doc.status === "excluded") {
        next.status = "pending";
      }

      const stamps = { updatedAt: FieldValue.serverTimestamp() };
      let targetRef = ref;
      if (doc.source === "registered" && next.email !== doc.email) {
        targetRef = certificates().doc(
          personCertificateId(slug, doc.kind, next.email)
        );
        const clash = await tx.get(targetRef);
        if (clash.exists) {
          throw new HttpError(
            409,
            "Esa persona ya está registrada con ese correo."
          );
        }
        tx.set(targetRef, {
          ...next,
          createdAt: doc.createdAt ?? FieldValue.serverTimestamp(),
          ...stamps,
        });
        tx.delete(ref);
      } else if (isNew) {
        tx.set(ref, {
          ...next,
          createdAt: FieldValue.serverTimestamp(),
          ...stamps,
        });
      } else {
        tx.set(ref, { ...next, ...stamps });
      }
      return { id: targetRef.id, view: toView(targetRef.id, next) };
    });

    await writeAuditLog(
      {
        action: "certificate.person.update",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: {
          certificateId: result.id,
          previousId: result.id === id ? undefined : id,
          kind: result.view.kind,
          fields: Object.keys(body).filter((k) => k !== "rosterId"),
        },
      },
      req
    );

    res.json({
      success: true,
      data: {
        certificate: { ...result.view, updatedAt: Date.now() },
        previousId: result.id === id ? null : id,
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** DELETE /api/events/:slug/certificates/:id — a registered volunteer/speaker. */
export async function removeCertificatePerson(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const ref = certificates().doc(id);

    const kind = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const doc = snap.exists ? (snap.data() as CertificateDoc) : null;
      if (!doc || eventMismatch(doc, slug)) {
        throw new HttpError(404, "Certificado no encontrado");
      }
      if (doc.source !== "registered") {
        throw new HttpError(400, "A un asistente no se le quita: usa Excluir.");
      }
      if (doc.status === "sending" || doc.status === "sent") {
        throw new HttpError(
          409,
          "Ya se envió o se está enviando; queda en el registro."
        );
      }
      tx.delete(ref);
      return doc.kind;
    });

    await writeAuditLog(
      {
        action: "certificate.person.remove",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: { certificateId: id, kind },
      },
      req
    );

    res.json({ success: true, data: { id } });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** Why a certificate cannot be queued as it stands, or null if it can. */
export function blockReason(
  doc: CertificateDoc | null,
  resend: boolean
): string | null {
  if (!doc) return null;
  switch (doc.status) {
    case "queued":
    case "sending":
      return "already_queued";
    case "sent":
      return resend ? null : "already_sent";
    case "excluded":
      return "excluded";
    default:
      return null;
  }
}

function queuedFields(uid: string, doc: CertificateDoc | null) {
  return {
    status: "queued" as const,
    attempts: 0,
    nextAttemptAt: Timestamp.now(),
    lastError: null,
    queuedAt: FieldValue.serverTimestamp(),
    queuedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    resendCount:
      doc?.status === "sent"
        ? (doc.resendCount ?? 0) + 1
        : (doc?.resendCount ?? 0),
  };
}

/**
 * POST /api/events/:slug/certificates/send
 *
 * Queues exactly the ids the organizer confirmed. Attendees are re-read
 * from the roster and must carry a check-in; anything already queued or
 * sent is skipped unless `resend` says otherwise. Runs in transactions so
 * a double click cannot reset a document the drain has just claimed.
 */
export async function enqueueCertificates(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const { kind, ids, resend = false } = req.body as CertificateEnqueueBody;

    const { settings, saved } = await loadSettings(slug);
    if (!saved) {
      res.status(409).json({
        success: false,
        error: "Guarda los datos del certificado antes de enviar.",
        missing: missingSettings(settings, kind),
      });
      return;
    }
    const missing = missingSettings(settings, kind);
    if (missing.length > 0) {
      res.status(409).json({
        success: false,
        error: "Faltan datos del certificado.",
        missing,
      });
      return;
    }

    const unique = [...new Set(ids)];
    const seenPeople = new Set<string>();
    let queued = 0;
    const skipped: { id: string; reason: string }[] = [];

    for (const chunk of chunks(unique)) {
      const result = await db().runTransaction(async (tx) => {
        // Rebuilt on every attempt: a retried transaction must not see
        // the people it "queued" in the failed attempt as duplicates.
        const seen = new Set(seenPeople);
        const out = {
          queued: 0,
          skipped: [] as { id: string; reason: string }[],
          seen,
        };

        if (kind === "attendee") {
          const rosterRefs = chunk.map((rid) => rosterOf(slug).doc(rid));
          const certRefs = chunk.map((rid) =>
            certificates().doc(attendeeCertificateId(slug, rid))
          );
          const rosterSnaps = await tx.getAll(...rosterRefs);
          const certSnaps = await tx.getAll(...certRefs);
          chunk.forEach((rid, i) => {
            const row = rosterSnaps[i].data();
            if (!rosterSnaps[i].exists || !row) {
              out.skipped.push({ id: rid, reason: "not_found" });
              return;
            }
            if (!checkinSource(row)) {
              out.skipped.push({ id: rid, reason: "no_checkin" });
              return;
            }
            const doc = certSnaps[i].exists
              ? (certSnaps[i].data() as CertificateDoc)
              : null;
            const reason = blockReason(doc, resend);
            if (reason) {
              out.skipped.push({ id: rid, reason });
              return;
            }
            const identity =
              doc?.overridden === true
                ? {
                    firstName: doc.firstName,
                    lastName: doc.lastName,
                    name: doc.name,
                    email: doc.email,
                  }
                : {
                    firstName: cleanNamePart(str(row.firstName)),
                    lastName: cleanNamePart(str(row.lastName)),
                    name: displayName(str(row.firstName), str(row.lastName)),
                    email: normalizeEmail(str(row.email)),
                  };
            // Two tickets bought with one email for the same name are one
            // person registered twice, not two people.
            const person = `${identity.email}|${identity.name.toLocaleLowerCase("es")}`;
            if (seen.has(person)) {
              out.skipped.push({ id: rid, reason: "duplicate" });
              return;
            }
            seen.add(person);
            tx.set(
              certRefs[i],
              {
                ...(doc
                  ? {}
                  : {
                      eventSlug: slug,
                      kind: "attendee",
                      source: "roster",
                      rosterId: rid,
                      hours: null,
                      createdAt: FieldValue.serverTimestamp(),
                      createdBy: user.uid,
                    }),
                ...identity,
                ...queuedFields(user.uid, doc),
              },
              { merge: true }
            );
            out.queued++;
          });
        } else {
          const refs = chunk.map((cid) => certificates().doc(cid));
          const snaps = await tx.getAll(...refs);
          chunk.forEach((cid, i) => {
            const doc = snaps[i].exists
              ? (snaps[i].data() as CertificateDoc)
              : null;
            if (!doc || eventMismatch(doc, slug) || doc.kind !== kind) {
              out.skipped.push({ id: cid, reason: "not_found" });
              return;
            }
            const reason = blockReason(doc, resend);
            if (reason) {
              out.skipped.push({ id: cid, reason });
              return;
            }
            tx.update(refs[i], queuedFields(user.uid, doc));
            out.queued++;
          });
        }
        return out;
      });
      queued += result.queued;
      skipped.push(...result.skipped);
      for (const person of result.seen) seenPeople.add(person);
    }

    if (queued > 0) await kickCertificateDrain();

    await writeAuditLog(
      {
        action: "certificate.enqueue",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: {
          kind,
          requested: unique.length,
          queued,
          skipped: skipped.length,
          resend,
        },
      },
      req
    );

    res.json({ success: true, data: { queued, skipped } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** POST /api/events/:slug/certificates/cancel — back from the queue. */
export async function cancelCertificates(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const { ids } = req.body as CertificateCancelBody;

    let cancelled = 0;
    const skipped: { id: string; reason: string }[] = [];
    for (const chunk of chunks([...new Set(ids)])) {
      const result = await db().runTransaction(async (tx) => {
        const refs = chunk.map((cid) => certificates().doc(cid));
        const snaps = await tx.getAll(...refs);
        const out = { cancelled: 0, skipped: [] as typeof skipped };
        snaps.forEach((snap, i) => {
          const doc = snap.exists ? (snap.data() as CertificateDoc) : null;
          if (!doc || eventMismatch(doc, slug)) {
            out.skipped.push({ id: chunk[i], reason: "not_found" });
            return;
          }
          // `sending` is already in the drain's hands.
          if (doc.status !== "queued") {
            out.skipped.push({ id: chunk[i], reason: doc.status });
            return;
          }
          tx.update(refs[i], {
            status: "pending",
            nextAttemptAt: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
          out.cancelled++;
        });
        return out;
      });
      cancelled += result.cancelled;
      skipped.push(...result.skipped);
    }

    await writeAuditLog(
      {
        action: "certificate.cancel",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: { requested: ids.length, cancelled },
      },
      req
    );

    res.json({ success: true, data: { cancelled, skipped } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * POST /api/certificates/preview
 *
 * One PDF built from the data in the form, returned as base64 for the panel
 * to open in a new tab (the CSP blocks blob: frames, so it cannot be shown
 * inline). Nothing is stored or sent.
 */
export async function previewCertificate(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { kind, name, content, hours } = req.body as CertificatePreviewBody;
    const pdf = await buildCertificatePdf({
      kind,
      recipientName: name,
      ...pdfEventFields(content, hours),
    });

    // No name in the details: a preview is often of a real person.
    await writeAuditLog(
      {
        action: "certificate.preview",
        performedBy: user.uid,
        targetId: kind,
        targetType: "certificate",
        details: { kind, eventName: content.eventName },
      },
      req
    );

    res.json({
      success: true,
      data: { pdfBase64: Buffer.from(pdf).toString("base64") },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * POST /api/certificates/manual
 *
 * Extraordinary cases: people typed in (or imported from a CSV) with
 * their own event data. Queued straight away. Ids derive from the form's
 * `submissionId`, so a retried submit after a timeout queues nobody twice.
 */
export async function createManualCertificates(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { submissionId, kind, eventSlug, content, recipients } =
      req.body as CertificateManualBody;

    const missing = missingSettings(content, kind);
    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        error: "Faltan datos del certificado.",
        missing,
      });
      return;
    }

    const refs = recipients.map((_, i) =>
      certificates().doc(manualCertificateId(submissionId, i))
    );
    const result = await db().runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      const seen = new Set<string>();
      const out = { queued: 0, existing: 0, duplicates: 0 };
      snaps.forEach((snap, i) => {
        if (snap.exists) {
          out.existing++;
          return;
        }
        const person = recipients[i];
        const firstName = cleanNamePart(person.firstName);
        const lastName = cleanNamePart(person.lastName);
        const name = displayName(firstName, lastName);
        const email = normalizeEmail(person.email);
        const key = `${email}|${name.toLocaleLowerCase("es")}`;
        if (seen.has(key)) {
          out.duplicates++;
          return;
        }
        seen.add(key);
        tx.set(refs[i], {
          eventSlug: null,
          eventRef: eventSlug,
          kind,
          source: "manual",
          rosterId: null,
          firstName,
          lastName,
          name,
          email,
          hours: null,
          content,
          submissionId,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          ...queuedFields(user.uid, null),
        });
        out.queued++;
      });
      return out;
    });

    if (result.queued > 0) await kickCertificateDrain();

    await writeAuditLog(
      {
        action: "certificate.manual",
        performedBy: user.uid,
        targetId: submissionId,
        targetType: "certificate",
        details: {
          kind,
          eventRef: eventSlug,
          eventName: content.eventName,
          ...result,
        },
      },
      req
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** GET /api/certificates/manual — the latest manual certificates. */
export async function listManualCertificates(_req: Request, res: Response) {
  try {
    const snap = await certificates()
      .where("source", "==", "manual")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    res.json({
      success: true,
      data: {
        serverTime: Date.now(),
        items: snap.docs.map((d) => toView(d.id, d.data() as CertificateDoc)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}
