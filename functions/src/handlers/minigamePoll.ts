import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { writeAuditLog } from "../utils/audit";

export async function answer(req: Request, res: Response) {
  try {
    const { slug, id } = req.params as { slug: string; id: string };
    const uid = (req as AuthenticatedRequest).user.uid;
    const { questionId, optionId } = req.body as {
      questionId: string;
      optionId: string;
    };
    const db = admin.firestore();
    const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
    const participantRef = instanceRef.collection("participants").doc(uid);
    const responseRef = instanceRef
      .collection("responses")
      .doc(`${uid}_${questionId}`);
    const outcome = await db.runTransaction(async (tx) => {
      const [instanceSnap, participantSnap, existing] = await Promise.all([
        tx.get(instanceRef),
        tx.get(participantRef),
        tx.get(responseRef),
      ]);
      if (!participantSnap.exists) return "not_joined";
      if (existing.exists) return "already_answered";
      const instance = instanceSnap.data();
      if (instance?.type !== "poll" || instance.state !== "live")
        return "not_live";
      const questions =
        instance.config?.questions ??
        (instance.config?.question
          ? [
              {
                id: "main",
                prompt: instance.config.question,
                options: instance.config.options,
              },
            ]
          : []);
      const currentIndex =
        instance.currentQuestionIndex ?? (instance.config?.question ? 0 : -1);
      const question = questions[currentIndex] as
        { id: string; options: { id: string }[] } | undefined;
      if (
        !question ||
        question.id !== questionId ||
        !question.options.some((option) => option.id === optionId)
      )
        return "invalid_question";
      tx.create(responseRef, {
        uid,
        questionId,
        optionId,
        answeredAt: Timestamp.now(),
      });
      return "ok";
    });
    if (outcome !== "ok") {
      res
        .status(
          outcome === "not_joined"
            ? 403
            : outcome === "already_answered"
              ? 409
              : 400
        )
        .json({ success: false, error: outcome });
      return;
    }
    await writeAuditLog(
      {
        action: "minigame_participant.poll.answer",
        performedBy: uid,
        targetId: id,
        targetType: "minigame_instance",
        details: { slug, questionId },
      },
      req
    );
    res.json({ success: true, data: { questionId, optionId } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}
