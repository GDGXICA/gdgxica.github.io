import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { letterForSequence } from "../services/credentialSequence";
import {
  buildCredentialSearchTokens,
  normalizeDni,
} from "../services/credentialSearch";
import {
  decodeJpegDataUrl,
  saveCredentialImages,
} from "../services/credentialStorage";
import type {
  CredentialCreateInput,
  CredentialImageInput,
} from "../schemas/credentials";

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
 * PATCH /api/events/:slug/credentials/:id/image
 *
 * Public, on the same anonymous token as create.
 *
 * Exists because the group letter derives from a server-assigned sequence
 * number: the client cannot render the final card until create returns,
 * so the card is attached in a second step rather than baked in
 * beforehand. Without this, the stored and emailed copy carries a
 * placeholder where the letter belongs.
 *
 * Pinned to the anonymous UID that created the record, so one visitor
 * cannot overwrite another's card even knowing the document id.
 */
export async function attachCredentialImage(req: Request, res: Response) {
  try {
    const { slug, id } = req.params as { slug: string; id: string };
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CredentialImageInput;

    const ref = admin
      .firestore()
      .collection("events")
      .doc(slug)
      .collection("credentials")
      .doc(id);

    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Credencial no encontrada" });
      return;
    }

    if (snap.data()?.createdByUid !== user.uid) {
      res.status(403).json({ success: false, error: "No autorizado" });
      return;
    }

    const image = decodeJpegDataUrl(
      body.credentialImageDataUrl,
      MAX_CREDENTIAL_BYTES
    );
    if (!image) {
      res
        .status(400)
        .json({ success: false, error: "No pudimos procesar la imagen" });
      return;
    }

    const paths = await saveCredentialImages(slug, id, { credential: image });
    if (!paths.credentialImagePath) {
      res
        .status(500)
        .json({ success: false, error: "No pudimos guardar la imagen" });
      return;
    }

    await ref.update({
      credentialImagePath: paths.credentialImagePath,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}
