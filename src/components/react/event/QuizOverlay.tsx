import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getFirestore } from "@/lib/firebase";
import type { QuizConfig } from "../admin/minigame-templates/types";
import { useAggregates } from "./useAggregates";
import { useParticipantDoc } from "./useParticipantDoc";
import { answerErrorMessage } from "./answerError";
import { QuizTimer } from "./QuizTimer";

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
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);

  const question = useMemo(
    () =>
      currentQuestionIndex < 0
        ? null
        : (config.questions[currentQuestionIndex] ?? null),
    [config.questions, currentQuestionIndex]
  );
  const questionId = question?.id ?? null;
  const activeQuestionIdRef = useRef<string | null>(questionId);
  activeQuestionIdRef.current = questionId;
  const initialQuestionIdRef = useRef<string | null>(questionId);
  const restoredInitialRef = useRef(false);

  const startedMs = currentQuestionStartedAt
    ? currentQuestionStartedAt.seconds * 1000 +
      Math.floor((currentQuestionStartedAt.nanoseconds ?? 0) / 1_000_000)
    : null;

  useEffect(() => {
    setReceipt(null);
    setPendingOptionId(null);
    setSubmitting(false);
    setError(null);
    setTimerExpired(
      Boolean(
        question &&
        startedMs !== null &&
        Date.now() - startedMs >= question.timeLimitSec * 1000
      )
    );
  }, [questionId, startedMs, question]);

  useEffect(() => {
    if (
      !questionId ||
      restoredInitialRef.current ||
      initialQuestionIdRef.current !== questionId
    ) {
      return;
    }
    restoredInitialRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const db = await getFirestore();
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(
          doc(
            db,
            `events/${slug}/minigames/${instanceId}/quiz_receipts/${uid}_${questionId}`
          )
        );
        if (
          !cancelled &&
          activeQuestionIdRef.current === questionId &&
          snap.exists()
        ) {
          setReceipt((snap.data() as { optionId: string }).optionId);
        }
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, instanceId, uid, questionId]);

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

  const handleExpire = useCallback(() => {
    setTimerExpired(true);
  }, []);

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
    const targetQuestionId = question.id;
    setSubmitting(true);
    setPendingOptionId(optionId);
    setError(null);
    try {
      const result = await api.answerQuizQuestion(
        slug,
        instanceId,
        targetQuestionId,
        optionId
      );
      if (activeQuestionIdRef.current !== targetQuestionId) return;
      if (
        result.success ||
        result.status === 409 ||
        result.error === "already_answered"
      ) {
        setReceipt(optionId);
      } else {
        setError(answerErrorMessage(result.error));
      }
    } catch (err) {
      if (activeQuestionIdRef.current !== targetQuestionId) return;
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos enviar tu respuesta. Intenta de nuevo."
      );
    } finally {
      if (activeQuestionIdRef.current === targetQuestionId) {
        setPendingOptionId(null);
        setSubmitting(false);
      }
    }
  }

  if (!question)
    return (
      <div className="py-12 text-center">
        <h2 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-balance text-(--ink)">
          {title}
        </h2>
        <p className="mt-4 text-(--muted)">
          Esperando que el organizador inicie la primera pregunta…
        </p>
        <p className="mt-8 font-mono text-3xl font-semibold text-(--ochre) tabular-nums">
          {animatedScore} puntos
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <QuizTimer
        questionId={question.id}
        questionIndex={currentQuestionIndex}
        totalQuestions={config.questions.length}
        timeLimitSec={question.timeLimitSec}
        startedMs={startedMs}
        stopped={Boolean(revealedAnswer)}
        onExpire={handleExpire}
      />
      <h2 className="mt-8 mb-0 text-[0.9375rem] font-medium text-(--muted)">
        {title}
      </h2>
      <p className="mt-2 text-[clamp(1.6rem,1.3rem+1.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.02em] text-balance text-(--ink)">
        {question.prompt}
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-red-400 pl-3 text-red-200"
        >
          {error}
        </p>
      )}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {question.options.map((opt, index) => {
          const count = counts[`${question.id}:${opt.id}`] ?? 0;
          const pct = total ? Math.round((100 * count) / total) : 0;
          const correct = revealedAnswer === opt.id;
          const selected = receipt === opt.id || pendingOptionId === opt.id;
          const isPending = pendingOptionId === opt.id;
          const colors = [
            "var(--g-blue)",
            "var(--g-red)",
            "var(--g-yellow)",
            "var(--g-green)",
          ];
          const color = colors[index % colors.length];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => answer(opt.id)}
              aria-busy={isPending}
              disabled={
                Boolean(revealedAnswer) ||
                answered ||
                timerExpired ||
                submitting
              }
              className={`relative min-h-20 overflow-hidden rounded-(--radius-sm) border border-l-4 bg-(--surface-2) p-4 text-left text-lg font-semibold text-(--ink) transition-[transform,background-color] enabled:hover:-translate-y-0.5 enabled:hover:bg-(--surface-3) enabled:active:translate-y-0 disabled:cursor-default motion-reduce:transition-none motion-reduce:enabled:hover:translate-y-0 ${selected ? "border-(--ochre) ring-2 ring-(--ochre)" : revealedAnswer && correct ? "border-(--g-green)" : "border-(--line)"} ${(revealedAnswer && !correct) || (submitting && !isPending) ? "opacity-55" : ""}`}
              style={{ borderLeftColor: color }}
            >
              {revealedAnswer && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/[0.07] transition-[width] duration-700 motion-reduce:transition-none"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) font-mono text-sm font-semibold ${index % colors.length === 2 ? "text-(--night)" : "text-white"}`}
                  style={{ background: color }}
                  aria-hidden="true"
                >
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="min-w-[7rem] flex-1 break-words">
                  {opt.label}
                </span>
                {isPending && (
                  <span className="font-mono text-sm font-medium text-(--ochre)">
                    Enviando…
                  </span>
                )}
                {revealedAnswer && correct && (
                  <span className="text-sm font-medium text-green-300">
                    ✓ Correcto
                  </span>
                )}
                {revealedAnswer && selected && !correct && (
                  <span className="text-sm font-medium text-(--ochre)">
                    Tu respuesta
                  </span>
                )}
                {revealedAnswer && (
                  <span className="ml-auto font-mono text-sm font-normal text-(--muted) tabular-nums">
                    {count} · {pct}%
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) pt-5">
        <div className="text-[0.9375rem] text-(--muted)" role="status">
          {submitting && !answered && <p>Enviando tu respuesta…</p>}
          {!submitting && !revealedAnswer && answered && (
            <p>
              Respuesta registrada. Verás la solución al terminar el tiempo.
            </p>
          )}
          {timerExpired && !revealedAnswer && !submitting && (
            <p>Tiempo terminado. Calculando resultados…</p>
          )}
          {revealedAnswer &&
            participant?.lastQuizQuestionId === question.id && (
              <p
                className="font-mono font-semibold text-(--ochre)"
                aria-live="polite"
              >
                +{participant.lastQuizPoints ?? 0} puntos
              </p>
            )}
          {!answered && !timerExpired && !submitting && (
            <p>Responde antes de que termine el tiempo.</p>
          )}
        </div>
        <p
          className="font-mono text-2xl font-semibold text-(--ochre) tabular-nums"
          aria-label="Tu puntuación"
        >
          {animatedScore} puntos
        </p>
      </div>
      {revealedAnswer && (aggregates?.leaderboard?.length ?? 0) > 0 && (
        <div className="mt-7 border-t border-(--line) pt-5">
          <h3 className="m-0 text-lg font-semibold text-(--ink)">
            Clasificación
          </h3>
          <ol className="mt-3 divide-y divide-(--line)">
            {aggregates?.leaderboard?.map((entry, index) => (
              <li
                key={entry.uid}
                className={`flex min-h-11 items-center justify-between gap-4 rounded-(--radius-sm) px-3 ${entry.uid === uid ? "bg-(--surface-2) font-semibold text-(--ochre)" : "text-(--ink)"}`}
              >
                <span>
                  {index + 1}. {entry.alias}
                </span>
                <span className="font-mono tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
