import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getFirestore } from "@/lib/firebase";
import type { QuizConfig } from "../admin/minigame-templates/types";
import { useAggregates } from "./useAggregates";
import { useParticipantDoc } from "./useParticipantDoc";
import { answerErrorMessage } from "./answerError";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  alias: string;
  title: string;
  config: QuizConfig;
  currentQuestionIndex: number;
  currentQuestionStartedAt?: { seconds: number; nanoseconds?: number } | null;
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
  const [now, setNow] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const question = useMemo(
    () =>
      currentQuestionIndex < 0
        ? null
        : (config.questions[currentQuestionIndex] ?? null),
    [config.questions, currentQuestionIndex]
  );

  useEffect(() => {
    if (!question) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [question]);

  useEffect(() => {
    setReceipt(null);
    if (!question) return;
    let cancelled = false;
    (async () => {
      try {
        const db = await getFirestore();
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(
          doc(
            db,
            `events/${slug}/minigames/${instanceId}/quiz_receipts/${uid}_${question.id}`
          )
        );
        if (!cancelled && snap.exists())
          setReceipt((snap.data() as { optionId: string }).optionId);
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, instanceId, uid, question?.id]);

  useEffect(() => {
    const target = participant?.quizScore ?? 0;
    if (target === animatedScore) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setAnimatedScore(target);
      return;
    }
    const start = animatedScore;
    const begun = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - begun) / 700);
      setAnimatedScore(
        Math.round(start + (target - start) * (1 - (1 - progress) ** 3))
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [participant?.quizScore]);

  const startedMs = currentQuestionStartedAt
    ? currentQuestionStartedAt.seconds * 1000 +
      Math.floor((currentQuestionStartedAt.nanoseconds ?? 0) / 1_000_000)
    : null;
  const remainingMs =
    question && startedMs !== null
      ? Math.max(0, question.timeLimitSec * 1000 - Math.max(0, now - startedMs))
      : (question?.timeLimitSec ?? 0) * 1000;
  const timerExpired = startedMs !== null && remainingMs <= 0;
  const revealedAnswer = question
    ? aggregates?.revealedAnswers?.[question.id]
    : undefined;
  const answered = Boolean(
    receipt ||
    (question && participant?.quizAnsweredQuestions?.includes(question.id))
  );
  const counts = aggregates?.optionCounts ?? {};
  const total =
    question?.options.reduce(
      (sum, opt) => sum + (counts[`${question.id}:${opt.id}`] ?? 0),
      0
    ) ?? 0;

  async function answer(optionId: string) {
    if (!question || answered || submitting || timerExpired) return;
    setSubmitting(true);
    setError(null);
    const result = await api.answerQuizQuestion(
      slug,
      instanceId,
      question.id,
      optionId
    );
    if (result.success) setReceipt(optionId);
    else setError(answerErrorMessage(result.error));
    setSubmitting(false);
  }

  if (!question)
    return (
      <div className="py-12 text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          Esperando que el organizador inicie la primera pregunta…
        </p>
        <p className="mt-8 text-3xl font-black text-blue-700 tabular-nums dark:text-blue-300">
          {animatedScore} puntos
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          Pregunta {currentQuestionIndex + 1} de {config.questions.length}
        </span>
        <span
          aria-label="Tiempo restante"
          className={`rounded-lg px-3 py-1 text-2xl font-black tabular-nums ${remainingMs <= 5000 ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}
        >
          {Math.ceil(remainingMs / 1000)}s
        </span>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        aria-label="Tiempo de la pregunta"
        aria-valuenow={Math.ceil(remainingMs / 1000)}
        aria-valuemin={0}
        aria-valuemax={question.timeLimitSec}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-100 motion-reduce:transition-none ${remainingMs <= 5000 ? "bg-google-red" : "bg-google-blue"}`}
          style={{
            width: `${Math.round((100 * remainingMs) / (question.timeLimitSec * 1000))}%`,
          }}
        />
      </div>
      <h2 className="mt-8 text-sm font-semibold text-gray-600 dark:text-gray-300">
        {title}
      </h2>
      <p className="mt-2 text-2xl leading-tight font-bold tracking-tight text-balance md:text-3xl">
        {question.prompt}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {question.options.map((opt, index) => {
          const count = counts[`${question.id}:${opt.id}`] ?? 0;
          const pct = total ? Math.round((100 * count) / total) : 0;
          const correct = revealedAnswer === opt.id;
          const selected = receipt === opt.id;
          const colors = [
            "bg-google-blue",
            "bg-google-red",
            "bg-google-yellow",
            "bg-google-green",
          ];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => answer(opt.id)}
              disabled={
                Boolean(revealedAnswer) ||
                answered ||
                timerExpired ||
                submitting
              }
              className={`relative min-h-24 overflow-hidden rounded-xl p-5 text-left text-lg font-bold shadow-[0_8px_18px_-12px_rgba(17,24,39,.5)] transition-[transform,filter] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-gray-950 enabled:hover:-translate-y-0.5 enabled:hover:brightness-110 enabled:active:translate-y-0 disabled:cursor-default motion-reduce:transition-none dark:focus-visible:outline-white ${index % colors.length === 2 ? "text-gray-950" : "text-white"} ${colors[index % colors.length]} ${selected ? "outline-4 outline-offset-2 outline-blue-800 dark:outline-blue-300" : ""} ${revealedAnswer && !correct ? "opacity-65" : ""}`}
            >
              {revealedAnswer && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/50 text-sm"
                  aria-hidden="true"
                >
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="min-w-0 flex-1 break-words">{opt.label}</span>
                {revealedAnswer && correct && (
                  <span className="text-sm">✓ Correcto</span>
                )}
                {revealedAnswer && selected && !correct && (
                  <span className="text-sm">Tu respuesta</span>
                )}
                {revealedAnswer && (
                  <span className="ml-auto text-sm tabular-nums">
                    {count} · {pct}%
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-5 dark:border-gray-700">
        <div className="text-sm text-gray-700 dark:text-gray-200" role="status">
          {!revealedAnswer && answered && (
            <p>
              Respuesta registrada. Verás la solución al terminar el tiempo.
            </p>
          )}
          {timerExpired && !revealedAnswer && (
            <p>Tiempo terminado. Calculando resultados…</p>
          )}
          {revealedAnswer &&
            participant?.lastQuizQuestionId === question.id && (
              <p
                className="font-bold text-blue-700 dark:text-blue-300"
                aria-live="polite"
              >
                +{participant.lastQuizPoints ?? 0} puntos
              </p>
            )}
          {!answered && !timerExpired && (
            <p>Responde antes de que termine el tiempo.</p>
          )}
        </div>
        <p
          className="text-2xl font-black text-blue-700 tabular-nums dark:text-blue-300"
          aria-label="Tu puntuación"
        >
          {animatedScore} puntos
        </p>
      </div>
      {revealedAnswer && (aggregates?.leaderboard?.length ?? 0) > 0 && (
        <div className="mt-7 border-t border-gray-200 pt-5 dark:border-gray-700">
          <h3 className="font-bold">Clasificación</h3>
          <ol className="mt-3 space-y-2">
            {aggregates?.leaderboard?.map((entry, index) => (
              <li
                key={entry.uid}
                className={`flex justify-between gap-4 rounded-lg px-2 py-1 ${entry.uid === uid ? "bg-blue-50 font-bold text-blue-800 dark:bg-blue-950/50 dark:text-blue-300" : ""}`}
              >
                <span>
                  {index + 1}. {entry.alias}
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
