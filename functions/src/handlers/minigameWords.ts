import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";

interface AuditDetails {
  slug: string;
  instanceId: string;
  wordId?: string;
  hidden?: boolean;
}

function auditEntry(
  action: string,
  performedBy: string,
  targetId: string,
  details: AuditDetails
) {
  return {
    action,
    performedBy,
    targetId,
    targetType: "minigame_word",
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function wordsCol(slug: string, instanceId: string) {
  return admin
    .firestore()
    .collection("events")
    .doc(slug)
    .collection("minigames")
    .doc(instanceId)
    .collection("words");
}

function participantsCol(slug: string, instanceId: string) {
  return admin
    .firestore()
    .collection("events")
    .doc(slug)
    .collection("minigames")
    .doc(instanceId)
    .collection("participants");
}

// GET /api/events/:slug/minigames/:id/words
//
// Admin-only endpoint that surfaces every word — including hidden ones —
// so the moderation panel can flip visibility. The public cloud uses a
// direct Firestore subscription with a client-side `hidden != true`
// filter, which is fine because the data is already public.
export async function listWords(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const snap = await wordsCol(slug, id).orderBy("count", "desc").get();
    res.json({
      success: true,
      data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// PATCH /api/events/:slug/minigames/:id/words/:wordId/hidden
// Body: { hidden: boolean }
export async function setWordHidden(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const wordId = req.params.wordId as string;
    const user = (req as AuthenticatedRequest).user;
    const { hidden } = req.body as { hidden: boolean };

    const ref = wordsCol(slug, id).doc(wordId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ success: false, error: "Word not found" });
      return;
    }
    await ref.update({
      hidden,
      hiddenAt: hidden ? admin.firestore.FieldValue.serverTimestamp() : null,
      hiddenBy: hidden ? user.uid : null,
    });
    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry(
          hidden ? "minigame_word.hide" : "minigame_word.unhide",
          user.uid,
          wordId,
          { slug, instanceId: id, wordId, hidden }
        )
      );
    res.json({ success: true, data: { id: wordId, hidden } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// GET /api/events/:slug/minigames/:id/winners
//
// Lists participants with bingoWonAt set, ordered ascending so the first
// to ring the bell shows up first.
export async function listWinners(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const snap = await participantsCol(slug, id)
      .where("bingoWonAt", "!=", null)
      .orderBy("bingoWonAt", "asc")
      .get();
    res.json({
      success: true,
      data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}
