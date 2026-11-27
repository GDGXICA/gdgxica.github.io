import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  getOrLoadInstance,
  getOrLoadParticipantMembership,
  reloadInstanceIfStale,
  type CachedInstanceData,
} from "../services/minigameCache";
import { logParticipantAudit } from "../utils/audit";

interface PollQuestion {
  id: string;
  options: { id: string }[];
}

function resolvePollQuestionState(instance: CachedInstanceData) {
  if (instance?.type !== "poll" || instance.state !== "live") {
    return { live: false as const, questions: [] as PollQuestion[], currentIndex: -1 };
  }
  const config = instance.config as
    | {
        questions?: PollQuestion[];
        question?: string;
        options?: { id: string }[];
      }
    | undefined;
  const questions: PollQuestion[] =
    config?.questions ??
    (config?.question ? [{ id: "main", options: config.options ?? [] }] : []);
  const currentIndex =
    (instance.currentQuestionIndex as number | undefined) ??
    (config?.question ? 0 : -1);
  return { live: true as const, questions, currentIndex };
}

function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    code === 6 ||
    code === "already-exists" ||
    (err instanceof Error && /already exists/i.test(err.message))
  );
}

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

    const loadInstance = async () => {
      const snap = await instanceRef.get();
      return snap.exists ? (snap.data() ?? null) : null;
    };

    const [cachedInstance, isJoined] = await Promise.all([
      getOrLoadInstance(slug, id, loadInstance),
      getOrLoadParticipantMembership(slug, id, uid, async () => {
        const snap = await participantRef.get();
        return snap.exists;
      }),
    ]);

    if (!isJoined) {
      res.status(403).json({ success: false, error: "not_joined" });
      return;
    }

    let instance = cachedInstance;
    let pollState = resolvePollQuestionState(instance);
    const shouldRefresh =
      !pollState.live ||
      (pollState.questions[pollState.currentIndex]?.id !== questionId &&
        pollState.questions.findIndex((q) => q.id === questionId) >
          pollState.currentIndex);

    if (shouldRefresh) {
      instance = await reloadInstanceIfStale(slug, id, instance, loadInstance);
      pollState = resolvePollQuestionState(instance);
    }

    if (!pollState.live) {
      res.status(400).json({ success: false, error: "not_live" });
      return;
    }

    const question = pollState.questions[pollState.currentIndex];
    if (
      !question ||
      question.id !== questionId ||
      !question.options.some((option) => option.id === optionId)
    ) {
      res.status(400).json({ success: false, error: "invalid_question" });
      return;
    }

    try {
      await responseRef.create({
        uid,
        questionId,
        optionId,
        answeredAt: Timestamp.now(),
      });
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        res.status(409).json({ success: false, error: "already_answered" });
        return;
      }
      throw err;
    }

    logParticipantAudit(
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
