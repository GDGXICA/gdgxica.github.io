import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  letterForSequence,
  mascotForCredentialId,
} from "../services/credentialSequence";
import {
  buildCredentialSearchTokens,
  normalizeDni,
} from "../services/credentialSearch";
import {
  decodeJpegDataUrl,
  deleteCredentialImages,
  saveCredentialImages,
} from "../services/credentialStorage";
import type {
  CredentialCreateInput,
  CredentialBevyStatusInput,
  CredentialPhotoModerationInput,
} from "../schemas/credentials";

// Kept in sync with src/components/react/credential/mascots.ts, which is
// the manifest the picker renders from. Only used to pick a replacement
// avatar when a photo is taken down.
const MASCOT_IDS = [
  "gdg-blue-a",
  "gdg-red-a",
  "gdg-yellow-a",
  "gdg-green-a",
  "gdg-blue-b",
  "gdg-red-b",
  "gdg-yellow-b",
  "gdg-green-b",
];

// Decoded-byte ceilings matching the character caps in the Zod schema.
// The schema bounds the string it receives; these bound the bytes it
// decodes to, which is what actually reaches the bucket.
const MAX_PHOTO_BYTES = 230_000;
const MAX_CREDENTIAL_BYTES = 480_000;

// Fallback when the event JSON carries no letter set. The loader already
// substitutes defaults, so reaching this means something upstream is
// misconfigured — and a degraded letter beats a rejected registration.
const DEFAULT_GROUP_LETTERS = ["A", "B", "C", "D"];

interface EventCredentialConfig {
  enabled?: boolean;
  group_letters?: string[];
}

/**
 * POST /api/events/:slug/credentials
 *
 * Public. Auth is any Firebase ID token, anonymous included, exactly as
 * with the mini-game join endpoint — the browser calls
 * signInAnonymouslyIfNeeded() first and requireAuth() skips the Firestore
 * role read.
 *
 * NOT idempotent, and deliberately so: an attendee may legitimately
 * regenerate a credential after fixing a typo, and a duplicate DNI must be
 * storable so the panel can surface it as a conflict. Blocking duplicates
 * would let anyone lock a real person out of registering by claiming their
 * number first.
 */
export async function createCredential(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CredentialCreateInput;

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(slug);

    const letters = await readGroupLetters(eventRef);

    // Decode before the transaction so a malformed image is rejected
    // without burning a sequence number. We only verify the container's
    // magic bytes — nothing decodes the image itself.
    const photo = decodeJpegDataUrl(body.photoDataUrl, MAX_PHOTO_BYTES);
    const credentialImage = decodeJpegDataUrl(
      body.credentialImageDataUrl,
      MAX_CREDENTIAL_BYTES
    );

    if (body.avatarKind === "photo" && !photo) {
      res.status(400).json({
        success: false,
        error: "No pudimos procesar la foto. Intenta con otra imagen.",
      });
      return;
    }

    const counterRef = eventRef.collection("credentialMeta").doc("counters");
    const credentialRef = eventRef.collection("credentials").doc();

    // The sequence number must be readable in the same write that stamps
    // it onto the credential, so a transaction is structurally required.
    // FieldValue.increment() is atomic but returns nothing, and a sharded
    // counter cannot produce the gapless sequence "first 100" needs.
    // Contention is a non-issue at event scale: Firestore sustains ~1
    // write/s per document and max_participants is in the hundreds.
    let sequenceNumber = 0;
    let groupLetter = letters[0] ?? "A";

    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const next =
        ((counterSnap.data()?.nextSequence as number | undefined) ?? 0) + 1;

      sequenceNumber = next;
      groupLetter = letterForSequence(next, letters);

      tx.set(counterRef, { nextSequence: next }, { merge: true });
      tx.create(credentialRef, {
        dni: body.dni,
        dniNormalized: normalizeDni(body.dni),
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        githubUsername: body.githubUsername,
        company: body.company,

        heardAbout: body.heardAbout,
        heardAboutOther: body.heardAboutOther,
        yearsExperience: body.yearsExperience,
        googleToolsLevel: body.googleToolsLevel,

        consentGdgTerms: body.consentGdgTerms,
        consentGooglePrivacy: body.consentGooglePrivacy,
        consentCodeOfConduct: body.consentCodeOfConduct,
        consentDataProcessing: body.consentDataProcessing,
        consentAgeAttested: body.consentAgeAttested,
        consentPolicyVersion: body.consentPolicyVersion,
        consentAt: FieldValue.serverTimestamp(),
        // From the REQUEST HEADER, never the body. A consent record whose
        // provenance the client supplied is worthless as evidence.
        consentUserAgent: singleLineHeader(req.get("user-agent")),

        sequenceNumber: next,
        groupLetter,
        avatarKind: body.avatarKind,
        mascotId: body.mascotId,

        photoStatus: photo ? "pending_review" : "none",
        photoPath: null,
        credentialImagePath: null,
        photoBytes: photo ? photo.length : null,
        photoUploadedAt: photo ? FieldValue.serverTimestamp() : null,
        photoReviewedAt: null,
        photoReviewedBy: null,
        photoRemovedReason: null,

        emailStatus: "queued",
        emailTemplate: "credential",
        emailAttempts: 0,
        emailNextAttemptAt: FieldValue.serverTimestamp(),
        emailLastAttemptAt: null,
        emailSentAt: null,
        emailLastError: null,

        bevyStatus: "pending",
        bevyLoadedAt: null,
        bevyLoadedBy: null,
        bevyTicketNumber: null,
        bevyNote: null,

        flags: [],
        searchTokens: buildCredentialSearchTokens({
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          dni: body.dni,
          githubUsername: body.githubUsername,
        }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdByUid: user.uid,
        source: "web",
        schemaVersion: 1,
      });
    });

    // Outside the transaction on purpose (see saveCredentialImages).
    if (photo || credentialImage) {
      const paths = await saveCredentialImages(slug, credentialRef.id, {
        photo,
        credential: credentialImage,
      });
      if (paths.photoPath || paths.credentialImagePath) {
        await credentialRef.update({
          photoPath: paths.photoPath,
          credentialImagePath: paths.credentialImagePath,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // No DNI, name or email in the audit details: audit_log is readable by
    // a different set of eyes than the credentials collection, and the
    // document id is enough to trace the record.
    await writeAuditLog({
      action: "credential.create",
      performedBy: user.uid,
      targetId: credentialRef.id,
      targetType: "credential",
      details: {
        eventSlug: slug,
        sequenceNumber,
        groupLetter,
        avatarKind: body.avatarKind,
        hasPhoto: Boolean(photo),
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      data: {
        credentialId: credentialRef.id,
        sequenceNumber,
        groupLetter,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Group letters configured on the event document in the data repo.
 *
 * A missing event or a missing block is not an error here: the route only
 * exists for events whose page was built with the feature enabled, and
 * falling back keeps a misconfiguration from rejecting registrations.
 */
async function readGroupLetters(
  eventRef: admin.firestore.DocumentReference
): Promise<string[]> {
  const snap = await eventRef.get();
  const config = snap.data()?.credential as EventCredentialConfig | undefined;
  const letters = config?.group_letters;
  return letters && letters.length > 0 ? letters : DEFAULT_GROUP_LETTERS;
}

/**
 * Collapses a header value to one bounded, control-character-free line.
 *
 * Mirrors singleLine() in services/email.ts. Applied here because the
 * user-agent is stored and later rendered in the admin panel.
 */
function singleLineHeader(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * PATCH /api/events/:slug/credentials/:id/bevy
 *
 * Records where a record stands in the manual load into Bevy. This is the
 * reconciliation ledger that keeps the transcription from being a silent
 * black hole: "pendiente" is the panel's headline metric precisely so a
 * pile of unloaded registrations cannot go unnoticed.
 */
export async function setBevyStatus(req: Request, res: Response) {
  try {
    const { slug, id } = req.params as { slug: string; id: string };
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CredentialBevyStatusInput;

    const ref = credentialRef(slug, id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Credencial no encontrada" });
      return;
    }

    const loaded = body.status === "loaded";
    await ref.update({
      bevyStatus: body.status,
      bevyTicketNumber: body.ticketNumber,
      bevyNote: body.note,
      // Attribution only for a positive claim; clearing the status back to
      // pending should not leave a stale "loaded by" behind.
      bevyLoadedAt: loaded ? FieldValue.serverTimestamp() : null,
      bevyLoadedBy: loaded ? user.uid : null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      action: "credential.bevy_status",
      performedBy: user.uid,
      targetId: id,
      targetType: "credential",
      details: { eventSlug: slug, status: body.status },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id, status: body.status } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * PATCH /api/events/:slug/credentials/:id/photo
 *
 * Photo moderation is REACTIVE take-down, not pre-publication gating. The
 * credential is composed on the attendee's device and downloaded before
 * anything is submitted, so a bad photo already exists on their phone no
 * matter what we do here. What this controls is what GDG ICA stores and
 * what GDG ICA re-sends — which is the part we are actually responsible
 * for, and what the privacy policy promises.
 */
export async function moderatePhoto(req: Request, res: Response) {
  try {
    const { slug, id } = req.params as { slug: string; id: string };
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CredentialPhotoModerationInput;

    const ref = credentialRef(slug, id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Credencial no encontrada" });
      return;
    }

    if (body.action === "approve") {
      await ref.update({
        photoStatus: "approved",
        photoReviewedAt: FieldValue.serverTimestamp(),
        photoReviewedBy: user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Delete the objects first: if the status flip succeeded and the
      // delete did not, the panel would show a moderated record while the
      // image stayed readable.
      await deleteCredentialImages(slug, id);
      await ref.update({
        photoStatus: "removed",
        photoPath: null,
        credentialImagePath: null,
        photoRemovedReason: body.reason,
        photoReviewedAt: FieldValue.serverTimestamp(),
        photoReviewedBy: user.uid,
        // Swap to a deterministic mascot so the attendee is shown the same
        // replacement every time, and re-queue the notification.
        avatarKind: "mascot",
        mascotId: mascotForCredentialId(id, MASCOT_IDS),
        emailStatus: "queued",
        emailTemplate: "photo_removed",
        emailAttempts: 0,
        emailNextAttemptAt: FieldValue.serverTimestamp(),
        emailLastError: null,
        // bevyStatus is deliberately untouched: the registration data is
        // independent of the photo, and a take-down must not un-load
        // someone a volunteer already transcribed.
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await writeAuditLog({
      action: "credential.moderate_photo",
      performedBy: user.uid,
      targetId: id,
      targetType: "credential",
      details: { eventSlug: slug, action: body.action },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id, action: body.action } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * POST /api/events/:slug/credentials/:id/email/retry
 *
 * Re-queues a credential the drain parked as `failed` after exhausting its
 * attempts. Resets the counter so the backoff ladder starts over.
 */
export async function retryEmail(req: Request, res: Response) {
  try {
    const { slug, id } = req.params as { slug: string; id: string };
    const user = (req as AuthenticatedRequest).user;

    const ref = credentialRef(slug, id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Credencial no encontrada" });
      return;
    }

    // Only a parked send may be re-queued by hand. Re-queueing something
    // mid-flight would race the drain's lease and could double-send.
    if (snap.data()?.emailStatus !== "failed") {
      res.status(409).json({
        success: false,
        error: "Solo se puede reintentar un envío marcado como fallido",
      });
      return;
    }

    await ref.update({
      emailStatus: "queued",
      emailAttempts: 0,
      emailNextAttemptAt: FieldValue.serverTimestamp(),
      emailLastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      action: "credential.email_retry",
      performedBy: user.uid,
      targetId: id,
      targetType: "credential",
      details: { eventSlug: slug },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

function credentialRef(slug: string, id: string) {
  return admin
    .firestore()
    .collection("events")
    .doc(slug)
    .collection("credentials")
    .doc(id);
}
