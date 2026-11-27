import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getFirestore } from "@/lib/firebase";
import {
  getServerNowMs,
  hasServerClockSample,
  syncServerClock,
} from "@/lib/serverClock";
import type { QuizConfig } from "../admin/minigame-templates/types";
import { StageConfetti } from "./StageConfetti";
import { QuizTimer } from "./QuizTimer";
import { answerErrorMessage } from "./answerError";
import {
  CheckIcon,
  CloseIcon,
  CrownIcon,
  MedalIcon,
  OptionShapeIcon,
  TrophyIcon,
} from "./icons";
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
  currentQuestionStartedAt?: { seconds: number; nanoseconds?: number } | null;
  justJoined?: boolean;
  closed?: boolean;
}

const OPTION_COLORS = [
  "var(--g-blue)",
  "var(--g-red)",
  "var(--g-yellow)",
  "var(--g-green)",
];

export function QuizOverlay({
  slug,
  instanceId,
  uid,
  title,
  config,
  currentQuestionIndex,
  currentQuestionStartedAt,
  justJoined = false,
  closed = false,
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
  const questionTimeLimitSec = question?.timeLimitSec ?? null;
  const activeQuestionIdRef = useRef<string | null>(questionId);
  activeQuestionIdRef.current = questionId;
  const initialQuestionIdRef = useRef<string | null>(questionId);
  const restoredInitialRef = useRef(justJoined);

  const startedMs = currentQuestionStartedAt
    ? currentQuestionStartedAt.seconds * 1000 +
      Math.floor((currentQuestionStartedAt.nanoseconds ?? 0) / 1_000_000)
    : null;

  useEffect(() => {
    if (!hasServerClockSample()) {
      void syncServerClock();
    }
  }, []);

  useEffect(() => {
    setReceipt(null);
    setPendingOptionId(null);
    setSubmitting(false);
    setError(null);
    setTimerExpired(
      Boolean(
        questionId &&
        questionTimeLimitSec !== null &&
        startedMs !== null &&
        getServerNowMs() - startedMs >= questionTimeLimitSec * 1000
      )
    );
  }, [questionId, startedMs, questionTimeLimitSec]);

  useEffect(() => {
    if (
      !questionId ||
      !uid ||
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
      const progress = Math.min(1, (time - begun) / 650);
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

  const leaderboard = aggregates?.leaderboard ?? [];

  // --- CLOSED / FINAL PODIUM VIEW ---
  if (closed) {
    const myRankIndex = leaderboard.findIndex((entry) => entry.uid === uid);
    const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
    const myFinalScore =
      (myRankIndex >= 0 ? leaderboard[myRankIndex]?.score : undefined) ??
      participant?.quizScore ??
      0;
    const madePodium = myRank !== null && myRank <= 3;

    const first = leaderboard[0] ?? null;
    const second = leaderboard[1] ?? null;
    const third = leaderboard[2] ?? null;

    return (
      <div className="mx-auto max-w-2xl">
        {madePodium && <StageConfetti burstKey="quiz-phone-podium" />}

        <div className="animate-stage-winner-in rounded-2xl border border-(--ochre)/50 bg-gradient-to-b from-(--ochre)/16 to-(--surface-2) p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-(--ochre) text-(--ochre-ink)">
            {myRank === 1 ? <CrownIcon size={28} /> : <TrophyIcon size={28} />}
          </span>
          <p className="mt-3 font-mono text-xs font-semibold tracking-[0.18em] text-(--ochre) uppercase">
            Podio final · {title}
          </p>
          {myRank !== null ? (
            <>
              <h2 className="mt-2 mb-0 font-(family-name:--font-display) text-3xl font-bold text-(--ink)">
                Quedaste en #{myRank}
              </h2>
              <p className="mt-1 font-mono text-xl font-bold text-(--ochre) tabular-nums">
                {myFinalScore} puntos
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-2 mb-0 font-(family-name:--font-display) text-3xl font-bold text-(--ink)">
                ¡Quiz finalizado!
              </h2>
              {myFinalScore > 0 && (
                <p className="mt-1 font-mono text-lg font-semibold text-(--ochre) tabular-nums">
                  Tu puntaje: {myFinalScore} puntos
                </p>
              )}
            </>
          )}
        </div>

        {leaderboard.length > 0 && (
          <div className="mt-6 grid grid-cols-3 items-end gap-2 text-center sm:gap-2.5">
            <div className="flex min-w-0 flex-col items-center">
              {second && (
                <>
                  <p className="mb-1.5 w-full truncate text-xs font-semibold text-(--ink) sm:text-sm">
                    {second.alias}
                  </p>
                  <div className="flex min-h-24 w-full flex-col items-center justify-center rounded-t-xl border border-b-0 border-slate-300/35 bg-slate-200/10 p-2 sm:p-2.5">
                    <MedalIcon size={18} className="text-slate-200" />
                    <span className="mt-1 font-mono text-xs text-(--muted)">
                      2.°
                    </span>
                    <span className="font-mono text-sm font-bold text-(--ink) tabular-nums sm:text-base">
                      {second.score}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col items-center">
              {first && (
                <>
                  <CrownIcon size={20} className="mb-1 text-(--ochre)" />
                  <p className="mb-1.5 w-full truncate text-sm font-bold text-(--ochre) sm:text-base">
                    {first.alias}
                  </p>
                  <div className="flex min-h-32 w-full flex-col items-center justify-center rounded-t-xl border border-b-0 border-(--ochre)/70 bg-(--ochre)/20 p-2 sm:p-3">
                    <TrophyIcon size={20} className="text-(--ochre)" />
                    <span className="mt-1 font-mono text-xs font-semibold text-(--ochre)">
                      1.°
                    </span>
                    <span className="font-mono text-base font-bold text-(--ink) tabular-nums sm:text-lg">
                      {first.score}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col items-center">
              {third && (
                <>
                  <p className="mb-1.5 w-full truncate text-xs font-semibold text-(--ink) sm:text-sm">
                    {third.alias}
                  </p>
                  <div className="flex min-h-20 w-full flex-col items-center justify-center rounded-t-xl border border-b-0 border-amber-500/40 bg-amber-500/12 p-2 sm:p-2.5">
                    <MedalIcon size={18} className="text-amber-400" />
                    <span className="mt-1 font-mono text-xs text-(--muted)">
                      3.°
                    </span>
                    <span className="font-mono text-sm font-bold text-(--ink) tabular-nums sm:text-base">
                      {third.score}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Full Top 10 List */}
        {leaderboard.length > 0 && (
          <div className="mt-6 border-t border-(--line) pt-5">
            <h3 className="m-0 font-mono text-xs font-semibold tracking-[0.18em] text-(--muted) uppercase">
              Clasificación final
            </h3>
            <ol className="mt-3 space-y-2">
              {leaderboard.map((entry, index) => {
                const isMe = entry.uid === uid;
                return (
                  <li
                    key={entry.uid}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2 ${
                      isMe
                        ? "border-(--ochre) bg-(--ochre)/15 font-semibold text-(--ochre)"
                        : "border-(--line) bg-(--surface-2) text-(--ink)"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="font-mono text-xs text-(--muted) tabular-nums">
                        #{index + 1}
                      </span>
                      <span className="truncate">
                        {entry.alias}
                        {isMe && " (tú)"}
                      </span>
                    </span>
                    <span className="font-mono font-bold tabular-nums">
                      {entry.score}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    );
  }

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
    navigator.vibrate?.(12);
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

  // --- WAITING FOR QUESTION 1 ---
  if (!question) {
    return (
      <div className="py-10 text-center">
        <span
          className="mx-auto block h-3 w-3 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
          aria-hidden="true"
        />
        <h2 className="mt-4 mb-0 font-(family-name:--font-display) text-2xl font-bold text-balance text-(--ink) sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-(--muted)">
          Esperando que el organizador inicie la primera pregunta…
        </p>
        <p className="mt-7 font-mono text-2xl font-bold text-(--ochre) tabular-nums">
          {animatedScore} puntos
        </p>
      </div>
    );
  }

  const earnedPoints =
    revealedAnswer && participant?.lastQuizQuestionId === question.id
      ? (participant.lastQuizPoints ?? 0)
      : null;
  const userGotItRight =
    Boolean(revealedAnswer) &&
    ((receipt !== null && receipt === revealedAnswer) ||
      (earnedPoints !== null && earnedPoints > 0));

  return (
    <div className="mx-auto max-w-2xl">
      <QuizTimer
        questionId={question.id}
        questionIndex={currentQuestionIndex}
        totalQuestions={config.questions.length}
        timeLimitSec={question.timeLimitSec}
        startedMs={startedMs}
        stopped={Boolean(revealedAnswer)}
        onExpire={handleExpire}
      />

      <h2 className="mt-3.5 mb-0 font-mono text-xs font-medium tracking-wider text-(--muted) uppercase sm:mt-5">
        {title}
      </h2>
      <p className="mt-1 font-(family-name:--font-display) text-[clamp(1.25rem,1.05rem+1.3vw,2rem)] leading-tight font-bold text-balance text-(--ink) sm:mt-1.5">
        {question.prompt}
      </p>

      {revealedAnswer && (
        <div
          className={`animate-stage-pop-in mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm sm:mt-4 sm:px-4 sm:py-3 sm:text-base ${
            userGotItRight
              ? "border-(--g-green)/60 bg-(--g-green)/15 text-green-200"
              : "border-red-400/40 bg-red-500/10 text-red-200"
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            {userGotItRight ? <CheckIcon size={18} /> : <CloseIcon size={18} />}
            {userGotItRight
              ? "¡Respuesta correcta!"
              : answered
                ? "Respuesta incorrecta"
                : "Se acabó el tiempo"}
          </span>
          {earnedPoints !== null && (
            <span className="font-mono font-bold text-(--ochre) tabular-nums">
              +{earnedPoints} puntos
            </span>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3.5 border-l-2 border-red-400 pl-3 text-sm text-red-200 sm:mt-4"
        >
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3">
        {question.options.map((opt, index) => {
          const count = counts[`${question.id}:${opt.id}`] ?? 0;
          const pct = total ? Math.round((100 * count) / total) : 0;
          const correct = revealedAnswer === opt.id;
          const selected = receipt === opt.id || pendingOptionId === opt.id;
          const isPending = pendingOptionId === opt.id;
          const color = OPTION_COLORS[index % OPTION_COLORS.length];

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
              className={`relative min-h-15 touch-manipulation overflow-hidden rounded-xl border border-l-4 bg-(--surface-2) p-3.5 text-left text-[0.9375rem] font-semibold text-(--ink) transition-[transform,background-color,opacity] select-none enabled:hover:bg-(--surface-3) enabled:active:scale-[0.98] disabled:cursor-default motion-reduce:transition-none sm:min-h-20 sm:p-4 sm:text-lg ${
                selected
                  ? "border-(--ochre) ring-2 ring-(--ochre)"
                  : revealedAnswer && correct
                    ? "border-(--g-green) ring-2 ring-(--g-green)/70"
                    : "border-(--line-strong)"
              } ${(revealedAnswer && !correct) || (submitting && !isPending) ? "opacity-45" : ""}`}
              style={{ borderLeftColor: color }}
            >
              {revealedAnswer && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/[0.08] transition-[width] duration-700 motion-reduce:transition-none"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    index % OPTION_COLORS.length === 2
                      ? "text-(--night)"
                      : "text-white"
                  }`}
                  style={{ background: color }}
                  aria-hidden="true"
                >
                  <OptionShapeIcon index={index} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{opt.label}</span>
                  {(revealedAnswer || isPending) && (
                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                      {isPending && (
                        <span className="font-mono font-semibold text-(--ochre)">
                          Enviando…
                        </span>
                      )}
                      {revealedAnswer && correct && (
                        <span className="inline-flex items-center gap-1 font-semibold text-green-300">
                          <CheckIcon size={14} />
                          Correcto
                        </span>
                      )}
                      {revealedAnswer && selected && !correct && (
                        <span className="font-medium text-(--ochre)">
                          Tu respuesta
                        </span>
                      )}
                      {revealedAnswer && (
                        <span className="font-mono font-normal text-(--muted) tabular-nums">
                          {count} · {pct}%
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Status + Score Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) pt-4">
        <div className="text-sm text-(--muted)" role="status">
          {submitting && !answered && <p>Enviando tu respuesta…</p>}
          {!submitting && !revealedAnswer && answered && (
            <p className="font-medium text-(--ink)">
              Respuesta registrada. Verás la solución al terminar el tiempo.
            </p>
          )}
          {timerExpired && !revealedAnswer && !submitting && (
            <p>Tiempo terminado. Calculando resultados…</p>
          )}
          {!answered && !timerExpired && !submitting && !revealedAnswer && (
            <p>Responde antes de que termine el tiempo.</p>
          )}
        </div>
        <p
          className="font-mono text-xl font-bold text-(--ochre) tabular-nums sm:text-2xl"
          aria-label="Tu puntuación"
        >
          {animatedScore} puntos
        </p>
      </div>

      {/* Partial Leaderboard */}
      {revealedAnswer && leaderboard.length > 0 && (
        <div className="mt-6 border-t border-(--line) pt-5">
          <h3 className="m-0 font-mono text-xs font-semibold tracking-[0.18em] text-(--muted) uppercase">
            Clasificación
          </h3>
          <ol className="mt-3 space-y-1.5">
            {leaderboard.map((entry, index) => (
              <li
                key={entry.uid}
                className={`flex min-h-11 items-center justify-between gap-4 rounded-xl px-3.5 ${
                  entry.uid === uid
                    ? "border border-(--ochre)/60 bg-(--ochre)/12 font-semibold text-(--ochre)"
                    : "bg-(--surface-2) text-(--ink)"
                }`}
              >
                <span className="truncate">
                  {index + 1}. {entry.alias}
                </span>
                <span className="font-mono font-bold tabular-nums">
                  {entry.score}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
