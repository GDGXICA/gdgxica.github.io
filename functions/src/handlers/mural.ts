import { createHash, randomUUID } from "node:crypto";
import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { decodeImageDataUrl } from "../services/imageStorage";
import { MAX_MURAL_PHOTO_BYTES } from "../services/imageLimits";
import { deleteMuralPhoto, saveMuralPhoto } from "../services/muralStorage";
import { isCleanAlias } from "../services/profanity";
import type { z } from "zod";
import type {
  muralPhotoSchema,
  muralRemovalRequestSchema,
  muralReviewSchema,
  muralSettingsSchema,
  muralTakedownSchema,
  muralUploaderBlockSchema,
} from "../schemas/mural";

const DEFAULT_MAX_PER_UID = 10;
const DEFAULT_MAX_TOTAL = 1500;

const CLOSED_MESSAGE =
  "Las subidas al mural están cerradas en este momento. ¡Gracias por participar!";

type MuralState = "closed" | "open" | "paused";

interface MuralSettings {
  state: MuralState;
  maxPerUid: number;
  maxTotal: number;
  acceptedTotal: number;
}

interface UploaderState {
  uploadedCount: number;
  blocked: boolean;
}

class MuralClosed extends Error {}
class MuralBlocked extends Error {}
class QuotaPerUid extends Error {
  constructor(readonly max: number) {
    super("per-uid quota reached");
  }
}
class MuralFull extends Error {
  constructor(readonly max: number) {
    super("mural full");
  }
}

function db() {
  return admin.firestore();
}

function settingsRef(slug: string) {
  return db().doc(`events/${slug}/muralMeta/settings`);
}

function uploaderRef(slug: string, uid: string) {
  return db().doc(`events/${slug}/muralUploaders/${uid}`);
}

function photoRef(slug: string, photoId: string) {
  return db().doc(`events/${slug}/muralPhotos/${photoId}`);
}

function readSettings(
  data: Record<string, unknown> | undefined
): MuralSettings {
  const state = data?.state;
  return {
    state: state === "open" ? "open" : state === "paused" ? "paused" : "closed",
    maxPerUid:
      typeof data?.maxPerUid === "number"
        ? data.maxPerUid
        : DEFAULT_MAX_PER_UID,
    maxTotal:
      typeof data?.maxTotal === "number" ? data.maxTotal : DEFAULT_MAX_TOTAL,
    acceptedTotal:
      typeof data?.acceptedTotal === "number" ? data.acceptedTotal : 0,
  };
}

function readUploader(
  data: Record<string, unknown> | undefined
): UploaderState {
  return {
    uploadedCount:
      typeof data?.uploadedCount === "number" ? data.uploadedCount : 0,
    blocked: data?.blocked === true,
  };
}

class DuplicateUpload extends Error {
  constructor(readonly id: string) {
    super("duplicate upload");
  }
}

function deterministicPhotoId(uid: string, clientRequestId: string): string {
  return createHash("sha256")
    .update(`${uid}:${clientRequestId}`)
    .digest("hex")
    .slice(0, 32);
}

function assertCanUpload(settings: MuralSettings, uploader: UploaderState) {
  if (settings.state !== "open") throw new MuralClosed();
  if (uploader.blocked) throw new MuralBlocked();
  if (uploader.uploadedCount >= settings.maxPerUid) {
    throw new QuotaPerUid(settings.maxPerUid);
  }
  if (settings.acceptedTotal >= settings.maxTotal) {
    throw new MuralFull(settings.maxTotal);
  }
}

export async function uploadPhoto(req: Request, res: Response) {
  const slug = req.params.slug as string;
  const user = (req as AuthenticatedRequest).user;
  const body = req.body as z.infer<typeof muralPhotoSchema>;

  let storedPath: string | null = null;

  try {
    const image = decodeImageDataUrl(body.dataUrl, MAX_MURAL_PHOTO_BYTES, [
      "jpg",
    ]);
    if (!image) {
      res.status(400).json({
        success: false,
        error: "La foto no es un JPEG válido o pesa demasiado.",
      });
      return;
    }

    const alias = body.alias;
    if (alias && !isCleanAlias(alias)) {
      res.status(400).json({
        success: false,
        error: "Ese nombre no se puede usar. Prueba con otro.",
      });
      return;
    }

    const dedupId = deterministicPhotoId(user.uid, body.clientRequestId);

    const [preSettings, preUploader, preExisting] = await Promise.all([
      settingsRef(slug).get(),
      uploaderRef(slug, user.uid).get(),
      photoRef(slug, dedupId).get(),
    ]);
    const settings = readSettings(preSettings.data());
    const uploader = readUploader(preUploader.data());

    let photoId = dedupId;
    if (preExisting.exists) {
      const previous = preExisting.data() ?? {};
      if (previous.status === "pending" || previous.status === "approved") {
        res.status(200).json({
          success: true,
          data: { id: dedupId, duplicate: true },
        });
        return;
      }
      photoId = randomUUID();
    }

    assertCanUpload(settings, uploader);

    const stored = await saveMuralPhoto(slug, photoId, image);
    storedPath = stored.path;

    await db().runTransaction(async (tx) => {
      const [settingsSnap, uploaderSnap, existingSnap] = await Promise.all([
        tx.get(settingsRef(slug)),
        tx.get(uploaderRef(slug, user.uid)),
        tx.get(photoRef(slug, photoId)),
      ]);
      const fresh = readSettings(settingsSnap.data());
      const freshUploader = readUploader(uploaderSnap.data());

      if (existingSnap.exists) throw new DuplicateUpload(photoId);

      assertCanUpload(fresh, freshUploader);

      tx.set(photoRef(slug, photoId), {
        eventSlug: slug,
        status: "pending",
        uid: user.uid,
        alias,
        storagePath: stored.path,
        downloadUrl: stored.url,
        width: body.width,
        height: body.height,
        bytes: image.buffer.length,
        contentType: image.contentType,
        createdAt: FieldValue.serverTimestamp(),
        approvedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: "",
        removalRequestedAt: null,
        removalRequestNote: "",
        removedReason: null,
        clientRequestId: body.clientRequestId,
        consentAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        settingsRef(slug),
        { acceptedTotal: FieldValue.increment(1) },
        { merge: true }
      );

      tx.set(
        uploaderRef(slug, user.uid),
        {
          uid: user.uid,
          alias,
          uploadedCount: FieldValue.increment(1),
          lastUploadAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    storedPath = null;

    await writeAuditLog(
      {
        action: "mural.photo.upload",
        performedBy: user.uid,
        targetId: photoId,
        targetType: "mural_photo",

        details: { eventSlug: slug, bytes: image.buffer.length },
      },
      req
    );

    res.status(201).json({ success: true, data: { id: photoId } });
  } catch (err) {
    if (err instanceof DuplicateUpload) {
      res
        .status(200)
        .json({ success: true, data: { id: err.id, duplicate: true } });
      return;
    }

    if (storedPath) {
      await deleteMuralPhoto(storedPath).catch((cleanupErr) => {
        logger.error("No se pudo limpiar una foto de mural rechazada", {
          slug,
          path: storedPath,
          err: cleanupErr,
        });
      });
    }

    if (err instanceof MuralClosed || err instanceof MuralBlocked) {
      res
        .status(409)
        .json({ success: false, code: "mural_closed", error: CLOSED_MESSAGE });
      return;
    }
    if (err instanceof QuotaPerUid) {
      res.status(409).json({
        success: false,
        code: "quota_uid",
        error: `Ya subiste tus ${err.max} fotos. ¡Gracias por participar!`,
      });
      return;
    }
    if (err instanceof MuralFull) {
      res.status(409).json({
        success: false,
        code: "mural_full",
        error:
          "El mural ya está lleno por hoy. Avísale a alguien de la organización.",
      });
      return;
    }
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function requestRemoval(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as z.infer<typeof muralRemovalRequestSchema>;

    const photoId = req.params.id as string;
    const ref = photoRef(slug, photoId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ success: false, error: "Foto no encontrada" });
      return;
    }

    const data = snap.data() ?? {};
    if (data.uid !== user.uid) {
      res.status(403).json({ success: false, error: "Esa foto no es tuya" });
      return;
    }

    if (data.status === "removed" || data.status === "rejected") {
      res.status(200).json({ success: true, data: { alreadyGone: true } });
      return;
    }

    if (data.removalRequestedAt) {
      res.status(200).json({ success: true, data: { alreadyRequested: true } });
      return;
    }

    await ref.update({
      removalRequestedAt: FieldValue.serverTimestamp(),
      removalRequestNote: body.note,
    });

    await writeAuditLog(
      {
        action: "mural.photo.removal_request",
        performedBy: user.uid,
        targetId: photoId,
        targetType: "mural_photo",
        details: { eventSlug: slug, status: data.status, reason: body.note },
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function reviewPhoto(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as z.infer<typeof muralReviewSchema>;

    const photoId = req.params.id as string;
    const ref = photoRef(slug, photoId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ success: false, error: "Foto no encontrada" });
      return;
    }

    const data = snap.data() ?? {};
    if (data.status !== "pending") {
      res.status(409).json({
        success: false,
        error: `Esta foto ya no está pendiente (está ${data.status}).`,
      });
      return;
    }

    if (body.decision === "reject") {
      if (typeof data.storagePath === "string") {
        await deleteMuralPhoto(data.storagePath);
      }
      await ref.update({
        status: "rejected",
        storagePath: null,
        downloadUrl: null,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: user.uid,
        reviewNote: body.note,
      });
    } else {
      await ref.update({
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: user.uid,
        reviewNote: body.note,
      });
    }

    await writeAuditLog(
      {
        action: "mural.photo.review",
        performedBy: user.uid,
        targetId: photoId,
        targetType: "mural_photo",
        details: {
          eventSlug: slug,
          decision: body.decision,
          reason: body.note,
        },
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function takedownPhoto(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as z.infer<typeof muralTakedownSchema>;

    const photoId = req.params.id as string;
    const ref = photoRef(slug, photoId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ success: false, error: "Foto no encontrada" });
      return;
    }

    const data = snap.data() ?? {};
    if (data.status !== "approved") {
      res.status(409).json({
        success: false,
        error: `Solo se retira una foto aprobada (esta está ${data.status}).`,
      });
      return;
    }

    if (typeof data.storagePath === "string") {
      await deleteMuralPhoto(data.storagePath);
    }

    await ref.update({
      status: "removed",
      storagePath: null,
      downloadUrl: null,
      removedReason: body.reason,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: user.uid,
      reviewNote: body.note,
    });

    await writeAuditLog(
      {
        action: "mural.photo.takedown",
        performedBy: user.uid,
        targetId: photoId,
        targetType: "mural_photo",
        details: { eventSlug: slug, reason: body.reason, note: body.note },
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function setSettings(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as z.infer<typeof muralSettingsSchema>;

    await settingsRef(slug).set(
      {
        state: body.state,
        maxPerUid: body.maxPerUid,
        maxTotal: body.maxTotal,
        headline: body.headline,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditLog(
      {
        action: "mural.settings.update",
        performedBy: user.uid,
        targetId: slug,
        targetType: "mural_settings",
        details: {
          eventSlug: slug,
          state: body.state,
          maxPerUid: body.maxPerUid,
          maxTotal: body.maxTotal,
        },
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

const RECLAIM_LIMIT = 200;

async function reclaimSlots(
  slug: string,
  target: string,
  moderator: string
): Promise<number> {
  const snap = await db()
    .collection(`events/${slug}/muralPhotos`)
    .where("uid", "==", target)
    .limit(RECLAIM_LIMIT)
    .get();

  let reclaimed = 0;

  for (const photo of snap.docs) {
    const data = photo.data() as {
      status?: unknown;
      storagePath?: unknown;
    };
    if (data.status !== "pending" && data.status !== "rejected") continue;

    if (data.status === "pending") {
      if (typeof data.storagePath === "string") {
        try {
          await deleteMuralPhoto(data.storagePath);
        } catch (err) {
          logger.error("No se pudo borrar una foto al bloquear al autor", {
            slug,
            path: data.storagePath,
            err,
          });
          continue;
        }
      }
      await photo.ref.update({
        status: "rejected",
        storagePath: null,
        downloadUrl: null,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: moderator,
        reviewNote: "Autor bloqueado por la organización",
      });
    }

    reclaimed += 1;
  }

  if (reclaimed > 0) {
    await db().runTransaction(async (tx) => {
      const snapshot = await tx.get(settingsRef(slug));
      const current = readSettings(snapshot.data()).acceptedTotal;
      tx.set(
        settingsRef(slug),
        { acceptedTotal: Math.max(0, current - reclaimed) },
        { merge: true }
      );
    });
  }

  return reclaimed;
}

export async function blockUploader(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const target = req.params.uid as string;
    const body = req.body as z.infer<typeof muralUploaderBlockSchema>;

    const before = await uploaderRef(slug, target).get();
    const alreadyReclaimed = before.data()?.slotsReclaimed === true;

    await uploaderRef(slug, target).set(
      {
        uid: target,
        blocked: body.blocked,
        blockedBy: body.blocked ? user.uid : null,
        blockNote: body.note,
      },
      { merge: true }
    );

    let reclaimed = 0;
    if (body.blocked && !alreadyReclaimed) {
      reclaimed = await reclaimSlots(slug, target, user.uid);
      await uploaderRef(slug, target).set(
        { slotsReclaimed: true },
        { merge: true }
      );
    }

    await writeAuditLog(
      {
        action: "mural.uploader.block",
        performedBy: user.uid,
        targetId: target,
        targetType: "mural_uploader",
        details: {
          eventSlug: slug,
          blocked: body.blocked,
          reason: body.note,
          reclaimed,
        },
      },
      req
    );

    res.json({ success: true, data: { reclaimed } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}
