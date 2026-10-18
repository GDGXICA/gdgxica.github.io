import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import type { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { writeAuditLog } from "../utils/audit";

interface QuizQuestion {
  id: string;
  options: { id: string }[];
  timeLimitSec: number;
  points: number;
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
    const outcome = await db.runTransaction(async (tx) => {
      const [instanceSnap, participantSnap, existing, secretSnap] =
        await Promise.all([
          tx.get(instanceRef),
          tx.get(participantRef),
          tx.get(answerRef),
          tx.get(secretRef),
        ]);
      if (!participantSnap.exists) return "not_joined";
      if (existing.exists) return "already_answered";
      const instance = instanceSnap.data();
      if (instance?.type !== "quiz" || instance.state !== "live")
        return "not_live";
      const question = (instance.config?.questions ?? [])[
        instance.currentQuestionIndex
      ] as QuizQuestion | undefined;
      if (
        !question ||
        question.id !== questionId ||
        !question.options.some((o) => o.id === optionId)
      )
        return "invalid_question";
      const startedAt = instance.currentQuestionStartedAt as
        Timestamp | undefined;
      if (!startedAt?.toMillis) return "not_live";
      const answeredAt = Timestamp.now();
      const elapsedMs = answeredAt.toMillis() - startedAt.toMillis();
      const limitMs = question.timeLimitSec * 1000;
      if (elapsedMs < 0 || elapsedMs >= limitMs) return "expired";
      const correctId = (
        secretSnap.data()?.answers as Record<string, string> | undefined
      )?.[questionId];
      if (!correctId) return "invalid_question";
      const isCorrect = optionId === correctId;
      const pointsEarned = isCorrect
        ? scoreQuizAnswer(question.points, elapsedMs, limitMs)
        : 0;
      tx.create(answerRef, {
        uid,
        questionId,
        optionId,
        isCorrect,
        pointsEarned,
        elapsedMs,
        answeredAt,
      });
      tx.create(receiptRef, { uid, questionId, optionId, answeredAt });
      return "ok";
    });
    if (outcome !== "ok") {
      const status =
        outcome === "not_joined"
          ? 403
          : outcome === "already_answered"
            ? 409
            : 400;
      res.status(status).json({ success: false, error: outcome });
      return;
    }
    await writeAuditLog(
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
  if (
    !roundSnap.exists ||
    roundSnap.data()?.startedAtMillis !== startedAtMillis
  )
    return;
  const instance = instanceSnap.data();
  const question = (instance?.config?.questions ?? []).find(
    (q: QuizQuestion) => q.id === questionId
  ) as QuizQuestion | undefined;
  const correctId = (
    secretSnap.data()?.answers as Record<string, string> | undefined
  )?.[questionId];
  if (!question || !correctId)
    throw new Error("Quiz configuration unavailable");
  const deadline = startedAtMillis + question.timeLimitSec * 1000;
  if (Date.now() < deadline) throw new Error("Question deadline not reached");

  const answersSnap = await instanceRef
    .collection("quiz_answers")
    .where("questionId", "==", questionId)
    .get();
  const answers = answersSnap.docs;
  for (let offset = 0; offset < answers.length; offset += 20) {
    await Promise.all(
      answers.slice(offset, offset + 20).map((answerDoc) =>
        db.runTransaction(async (tx) => {
          const fresh = await tx.get(answerDoc.ref);
          const data = fresh.data();
          if (!data || data.scoredAt) return;
          tx.update(instanceRef.collection("participants").doc(data.uid), {
            quizScore: FieldValue.increment(data.pointsEarned),
            quizElapsedMs: FieldValue.increment(
              data.isCorrect ? data.elapsedMs : 0
            ),
            quizAnsweredQuestions: FieldValue.arrayUnion(questionId),
            lastQuizPoints: data.pointsEarned,
            lastQuizQuestionId: questionId,
          });
          tx.update(answerDoc.ref, { scoredAt: FieldValue.serverTimestamp() });
        })
      )
    );
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
  await instanceRef
    .collection("aggregates")
    .doc("current")
    .set(
      {
        optionCounts: counts,
        leaderboard,
        revealedAnswers: { [questionId]: correctId },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  await roundRef.set(
    { finishedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export const finishQuizQuestion = onTaskDispatched<FinishPayload>(
  {
    region: "us-central1",
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 5 },
  },
  async (request) => finishQuestion(request.data)
);
