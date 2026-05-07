import { useEffect, useMemo, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { QuizConfig } from "../admin/minigame-templates/types";
import { useAggregates } from "./useAggregates";
import { useParticipantDoc } from "./useParticipantDoc";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  alias: string;
  title: string;
  config: QuizConfig;
  currentQuestionIndex: number;
  // Server timestamp arrives as `{ seconds, nanoseconds }`. Optional because
  // it is null while the quiz is still on the "Esperando inicio" state.
  currentQuestionStartedAt?:
    | { seconds: number; nanoseconds?: number }
    | null
    | undefined;
}

function timestampToMillis(
  ts: Props["currentQuestionStartedAt"]
): number | null {
  if (!ts) return null;
  if (typeof ts.seconds !== "number") return null;
  return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
}

export function QuizOverlay({
  slug,
  instanceId,
  uid,
  title,
  config,
  currentQuestionIndex,
  currentQuestionStartedAt,
}: Props) {
  const { doc: participant } = useParticipantDoc(slug, instanceId, uid);
  const { aggregates } = useAggregates(slug, instanceId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const question = useMemo(() => {
    if (currentQuestionIndex < 0) return null;
    return config.questions[currentQuestionIndex] ?? null;
  }, [config.questions, currentQuestionIndex]);

  // Tick the clock so the visible countdown updates without the
  // surrounding tree re-rendering. 250ms keeps it smooth without burning
  // cycles.
  useEffect(() => {
    if (!question) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [question]);

  const startedAtMs = timestampToMillis(currentQuestionStartedAt);
  const elapsedMs = startedAtMs ? Math.max(0, now - startedAtMs) : 0;
  const limitMs = (question?.timeLimitSec ?? 0) * 1000;
  const remainingMs = startedAtMs ? Math.max(0, limitMs - elapsedMs) : limitMs;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const timerExpired = startedAtMs !== null && remainingMs === 0;

  const answered = Boolean(
    question && participant?.quizAnsweredQuestions?.includes(question.id)
  );

  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = question
    ? question.options.reduce(
        (sum, opt) => sum + (counts[`${question.id}:${opt.id}`] ?? 0),
        0
      )
    : 0;
  const showResults = answered || timerExpired;
  const leaderboard = aggregates?.leaderboard ?? [];

  async function answer(optionId: string) {
    if (!question || answered || submitting || timerExpired) return;
    setSubmitting(true);
    setError(null);
    try {
      const isCorrect = optionId === question.correctOptionId;
      const pointsEarned = isCorrect ? question.points : 0;
      const db = await getFirestore();
      const { arrayUnion, doc, increment, serverTimestamp, setDoc } =
        await import("firebase/firestore");
      const responseRef = doc(
        db,
        `events/${slug}/minigames/${instanceId}/responses/${uid}_${question.id}`
      );
      const participantRef = doc(
        db,
        `events/${slug}/minigames/${instanceId}/participants/${uid}`
      );
      await setDoc(responseRef, {
        uid,
        questionId: question.id,
        optionId,
        isCorrect,
        pointsEarned,
        answeredAt: serverTimestamp(),
      });
      await setDoc(
        participantRef,
        {
          quizScore: increment(pointsEarned),
          quizAnsweredQuestions: arrayUnion(question.id),
        },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar");
    } finally {
      setSubmitting(false);
    }
  }

  if (!question) {
    return (
      <div className="text-center">
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          Quiz
        </span>
        <h2 className="text-primary mt-3 text-2xl font-semibold">{title}</h2>
        <p className="text-secondary mt-2">
          Esperando que el organizador inicie la primera pregunta...
        </p>
        {participant?.quizScore !== undefined && participant.quizScore > 0 && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Tu puntuación: <strong>{participant.quizScore}</strong>
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          Pregunta {currentQuestionIndex + 1} / {config.questions.length}
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            remainingSec <= 5
              ? "text-red-600 dark:text-red-400"
              : "text-gray-700 dark:text-gray-300"
          }`}
          aria-label="Tiempo restante"
        >
          {remainingSec}s
        </span>
      </div>
      <h2 className="text-primary mb-4 text-2xl font-semibold">{title}</h2>
      <p className="text-secondary mb-4 text-base">{question.prompt}</p>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {question.options.map((opt) => {
          const count = counts[`${question.id}:${opt.id}`] ?? 0;
          const pct =
            totalForQuestion > 0
              ? Math.round((count / totalForQuestion) * 100)
              : 0;
          const isCorrect = opt.id === question.correctOptionId;

          if (showResults) {
            return (
              <li
                key={opt.id}
                className={`relative overflow-hidden rounded-lg border px-4 py-3 ${
                  isCorrect
                    ? "border-green-500 bg-white dark:border-green-400 dark:bg-gray-800"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                }`}
              >
                <div
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-all ${
                    isCorrect
                      ? "bg-green-500/30"
                      : "bg-gray-300/40 dark:bg-gray-600/40"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {opt.label}
                    {isCorrect && (
                      <span className="ml-2 text-xs text-green-700 dark:text-green-300">
                        Correcto
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-gray-700 tabular-nums dark:text-gray-300">
                    {count} · {pct}%
                  </span>
                </div>
              </li>
            );
          }

          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => answer(opt.id)}
                disabled={submitting || answered || timerExpired}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-left font-medium text-gray-900 transition hover:border-purple-500 hover:bg-purple-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>

      {participant?.quizScore !== undefined && (
        <p className="mt-4 text-center text-sm text-gray-700 dark:text-gray-300">
          Tu puntuación: <strong>{participant.quizScore}</strong>
        </p>
      )}

      {leaderboard.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          <p className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
            Top 10
          </p>
          <ol className="space-y-1">
            {leaderboard.map((entry, i) => (
              <li
                key={entry.uid}
                className={`flex items-center justify-between text-sm ${
                  entry.uid === uid
                    ? "font-semibold text-purple-700 dark:text-purple-300"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <span>
                  {i + 1}. {entry.alias}
                  {entry.uid === uid && " (tú)"}
                </span>
                <span className="tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
