import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import type { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  getOrLoadInstance,
  getOrLoadParticipantMembership,
  getOrLoadQuizAnswers,
  reloadInstanceIfStale,
  type CachedInstanceData,
} from "../services/minigameCache";
import { logParticipantAudit } from "../utils/audit";

interface QuizQuestion {
  id: string;
  options: { id: string }[];
  timeLimitSec: number;
  points: number;
}

function resolveQuizQuestionState(instance: CachedInstanceData) {
  if (instance?.type !== "quiz" || instance.state !== "live") {
    return { live: false as const, questions: [] as QuizQuestion[], currentIndex: -1 };
  }
  const config = instance.config as
    { questions?: QuizQuestion[] } | undefined;
  const questions = config?.questions ?? [];
  const currentIndex =
    typeof instance.currentQuestionIndex === "number"
      ? instance.currentQuestionIndex
      : -1;
  return { live: true as const, questions, currentIndex };
}

const SCORING_LOCK_TTL_MS = 30_000;
const SCORE_BATCH_SIZE = 200;

function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    code === 6 ||
    code === "already-exists" ||
    (err instanceof Error && /already exists/i.test(err.message))
  );
}

export function scoreQuizAnswer(
  points: number,
  elapsedMs: number,
  limitMs: number
): number {
  if (elapsedMs > limitMs) return 0;
  return Math.round(
    points * (0.2 + 0.8 * Math.max(0, 1 - elapsedMs / limitMs))
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
    const answerRef = instanceRef
      .collection("quiz_answers")
      .doc(`${uid}_${questionId}`);
    const receiptRef = instanceRef
      .collection("quiz_receipts")
      .doc(`${uid}_${questionId}`);
    const participantRef = instanceRef.collection("participants").doc(uid);
    const secretRef = instanceRef.collection("secret").doc("quiz");

    const loadInstance = async () => {
      const snap = await instanceRef.get();
      return snap.exists ? (snap.data() ?? null) : null;
    };

    const [cachedInstance, secretAnswers, isJoined] = await Promise.all([
      getOrLoadInstance(slug, id, loadInstance),
      getOrLoadQuizAnswers(slug, id, async () => {
        const snap = await secretRef.get();
        const data = snap.data()?.answers as Record<string, string> | undefined;
        return data ?? null;
      }),
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
    let quizState = resolveQuizQuestionState(instance);
    const shouldRefresh =
      !quizState.live ||
      (quizState.questions[quizState.currentIndex]?.id !== questionId &&
        quizState.questions.findIndex((q) => q.id === questionId) >
          quizState.currentIndex);

    if (shouldRefresh) {
      instance = await reloadInstanceIfStale(slug, id, instance, loadInstance);
      quizState = resolveQuizQuestionState(instance);
    }

    if (!quizState.live || !instance) {
      res.status(400).json({ success: false, error: "not_live" });
      return;
    }

    const question = quizState.questions[quizState.currentIndex];
    if (
      !question ||
      question.id !== questionId ||
      !question.options.some((o) => o.id === optionId)
    ) {
      res.status(400).json({ success: false, error: "invalid_question" });
      return;
    }

    const startedAt = instance.currentQuestionStartedAt as
      Timestamp | undefined;
    if (!startedAt?.toMillis) {
      res.status(400).json({ success: false, error: "not_live" });
      return;
    }

    const answeredAt = Timestamp.now();
    const elapsedMs = answeredAt.toMillis() - startedAt.toMillis();
    const limitMs = question.timeLimitSec * 1000;
    if (elapsedMs < 0 || elapsedMs >= limitMs) {
      res.status(400).json({ success: false, error: "expired" });
      return;
    }

    const correctId = secretAnswers?.[questionId];
    if (!correctId) {
      res.status(400).json({ success: false, error: "invalid_question" });
      return;
    }

    const isCorrect = optionId === correctId;
    const pointsEarned = isCorrect
      ? scoreQuizAnswer(question.points, elapsedMs, limitMs)
      : 0;

    try {
      const batch = db.batch();
      batch.create(answerRef, {
        uid,
        questionId,
        optionId,
        isCorrect,
        pointsEarned,
        elapsedMs,
        answeredAt,
      });
      batch.create(receiptRef, { uid, questionId, optionId, answeredAt });
      await batch.commit();
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        res.status(409).json({ success: false, error: "already_answered" });
        return;
      }
      throw err;
    }

    logParticipantAudit(
      {
        action: "minigame_participant.quiz.answer",
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

interface FinishPayload {
  slug: string;
  id: string;
  questionId: string;
  startedAtMillis: number;
}

export async function finishQuestion({
  slug,
  id,
  questionId,
  startedAtMillis,
}: FinishPayload) {
  const db = admin.firestore();
  const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
  const roundRef = instanceRef.collection("quiz_rounds").doc(questionId);
  const [roundSnap, secretSnap, instanceSnap] = await Promise.all([
    roundRef.get(),
    instanceRef.collection("secret").doc("quiz").get(),
    instanceRef.get(),
  ]);
  const roundData = roundSnap.data();
  if (!roundSnap.exists || roundData?.startedAtMillis !== startedAtMillis) {
    return;
  }
  if (roundData?.finishedAt) {
    return;
  }

  const instance = instanceSnap.data();
  const question = (instance?.config?.questions ?? []).find(
    (q: QuizQuestion) => q.id === questionId
  ) as QuizQuestion | undefined;
  const correctId = (
    secretSnap.data()?.answers as Record<string, string> | undefined
  )?.[questionId];
  if (!question || !correctId) {
    throw new Error("Quiz configuration unavailable");
  }
  const deadline = startedAtMillis + question.timeLimitSec * 1000;
  if (Date.now() < deadline) {
    throw new Error("Question deadline not reached");
  }

  const acquired = await db.runTransaction(async (tx) => {
    const freshRound = await tx.get(roundRef);
    const data = freshRound.data();
    if (!freshRound.exists || data?.startedAtMillis !== startedAtMillis) {
      return false;
    }
    if (data?.finishedAt) return false;
    const lockedAt = data?.scoringLockedAt as number | undefined;
    const now = Date.now();
    if (typeof lockedAt === "number" && now - lockedAt < SCORING_LOCK_TTL_MS) {
      return false;
    }
    tx.update(roundRef, { scoringLockedAt: now });
    return true;
  });
  if (!acquired) return;

  const answersSnap = await instanceRef
    .collection("quiz_answers")
    .where("questionId", "==", questionId)
    .get();
  const answers = answersSnap.docs;
  const unscored = answers.filter((doc) => !doc.data().scoredAt);

  for (let offset = 0; offset < unscored.length; offset += SCORE_BATCH_SIZE) {
    const batch = db.batch();
    for (const answerDoc of unscored.slice(offset, offset + SCORE_BATCH_SIZE)) {
      const data = answerDoc.data();
      batch.update(instanceRef.collection("participants").doc(data.uid), {
        quizScore: FieldValue.increment(data.pointsEarned),
        quizElapsedMs: FieldValue.increment(
          data.isCorrect ? data.elapsedMs : 0
        ),
        quizAnsweredQuestions: FieldValue.arrayUnion(questionId),
        lastQuizPoints: data.pointsEarned,
        lastQuizQuestionId: questionId,
      });
      batch.update(answerDoc.ref, { scoredAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }

  const counts: Record<string, number> = {};
  for (const doc of answers) {
    const optionId = doc.data().optionId as string;
    const key = `${questionId}:${optionId}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const participantsSnap = await instanceRef.collection("participants").get();
  const leaderboard = participantsSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        alias: data.alias ?? "Anónimo",
        score: data.quizScore ?? 0,
        elapsedMs: data.quizElapsedMs ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.elapsedMs - b.elapsedMs ||
        a.uid.localeCompare(b.uid)
    )
    .slice(0, 10);

  const finalizeBatch = db.batch();
  finalizeBatch.set(
    instanceRef.collection("aggregates").doc("current"),
    {
      ...(Object.keys(counts).length > 0 ? { optionCounts: counts } : {}),
      leaderboard,
      revealedAnswers: { [questionId]: correctId },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  finalizeBatch.set(
    roundRef,
    { finishedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await finalizeBatch.commit();
}

export const finishQuizQuestion = onTaskDispatched<FinishPayload>(
  {
    region: "us-central1",
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 5 },
  },
  async (request) => finishQuestion(request.data)
);
