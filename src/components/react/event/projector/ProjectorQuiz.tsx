import { useEffect, useMemo, useRef, useState } from "react";
import { getServerNowMs } from "@/lib/serverClock";
import type { QuizConfig } from "../../admin/minigame-templates/types";
import { StageConfetti } from "../StageConfetti";
import {
  CheckIcon,
  CrownIcon,
  MedalIcon,
  OptionShapeIcon,
  TrophyIcon,
  UsersIcon,
} from "../icons";
import { playCountdownTick, playPodiumChord } from "../stageAudio";
import type { LiveInstance } from "../types";
import { useAggregates } from "../useAggregates";

const OPTION_STYLES = [
  "bg-google-blue text-white",
  "bg-google-red text-white",
  "bg-google-yellow text-[#070b16]",
  "bg-google-green text-white",
];

interface Props {
  slug: string;
  instance: LiveInstance;
  onFocusModeChange?: (focused: boolean) => void;
}

export function ProjectorQuiz({ slug, instance, onFocusModeChange }: Props) {
  const config = instance.config as unknown as QuizConfig;
  const { aggregates } = useAggregates(slug, instance.id);
  const isClosed = instance.state === "closed";

  const startedAt = instance.currentQuestionStartedAt;
  const idx = instance.currentQuestionIndex ?? -1;
  const question = idx >= 0 ? (config.questions[idx] ?? null) : null;

  const [now, setNow] = useState(() => getServerNowMs());
  const startedMs = startedAt?.seconds
    ? startedAt.seconds * 1000 +
      Math.floor((startedAt.nanoseconds ?? 0) / 1_000_000)
    : null;
  const elapsedMs = startedMs ? Math.max(0, now - startedMs) : 0;
  const limitMs = (question?.timeLimitSec ?? 0) * 1000;
  const remainingMs = startedMs ? Math.max(0, limitMs - elapsedMs) : limitMs;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const pctRemaining =
    limitMs > 0 ? Math.max(0, Math.min(100, (remainingMs / limitMs) * 100)) : 0;

  const revealedAnswer = question
    ? aggregates?.revealedAnswers?.[question.id]
    : undefined;

  const lastTickSecRef = useRef<number | null>(null);

  useEffect(() => {
    setNow(getServerNowMs());
    lastTickSecRef.current = null;
  }, [question?.id, startedMs]);

  useEffect(() => {
    if (
      isClosed ||
      !question ||
      revealedAnswer ||
      remainingMs <= 0 ||
      startedMs === null
    ) {
      return;
    }
    const stepMs = remainingMs <= 5000 ? 250 : 1000;
    const id = window.setTimeout(() => setNow(getServerNowMs()), stepMs);
    return () => window.clearTimeout(id);
  }, [isClosed, question, revealedAnswer, remainingMs, startedMs, now]);

  // Audio ticks in the last 5 seconds (if presenter enabled sound).
  useEffect(() => {
    if (isClosed || !question || revealedAnswer || startedMs === null) return;
    if (remainingSec > 0 && remainingSec <= 5) {
      if (lastTickSecRef.current !== remainingSec) {
        lastTickSecRef.current = remainingSec;
        playCountdownTick(remainingSec <= 3);
      }
    }
  }, [isClosed, question, revealedAnswer, startedMs, remainingSec]);

  // Staggered podium reveal when closed.
  const [podiumStep, setPodiumStep] = useState(0);
  const leaderboard = useMemo(
    () => aggregates?.leaderboard ?? [],
    [aggregates?.leaderboard]
  );

  useEffect(() => {
    onFocusModeChange?.(isClosed);
    return () => onFocusModeChange?.(false);
  }, [isClosed, onFocusModeChange]);

  useEffect(() => {
    if (!isClosed) {
      setPodiumStep(0);
      return;
    }
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) {
      setPodiumStep(3);
      return;
    }
    setPodiumStep(0);
    const t1 = window.setTimeout(() => {
      setPodiumStep(1);
      playPodiumChord(3);
    }, 220);
    const t2 = window.setTimeout(() => {
      setPodiumStep(2);
      playPodiumChord(2);
    }, 880);
    const t3 = window.setTimeout(() => {
      setPodiumStep(3);
      playPodiumChord(1);
    }, 1580);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [isClosed]);

  // --- FINAL PODIUM VIEW ---
  if (isClosed) {
    const first = leaderboard[0] ?? null;
    const second = leaderboard[1] ?? null;
    const third = leaderboard[2] ?? null;
    const runnersUp = leaderboard.slice(3, 10);

    return (
      <div className="relative flex flex-1 flex-col justify-center">
        {podiumStep >= 3 && first && <StageConfetti burstKey="quiz-podium" />}

        <div className="mx-auto w-full max-w-6xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-(--ochre)/40 bg-(--ochre)/10 px-4 py-1.5 font-mono text-sm font-semibold tracking-[0.18em] text-(--ochre) uppercase">
            <TrophyIcon size={16} />
            Podio final · {instance.title}
          </div>

          <h2 className="mt-4 font-(family-name:--font-display) text-4xl font-bold tracking-tight text-white sm:text-6xl">
            {first ? "¡Tenemos ganadores!" : "Quiz finalizado"}
          </h2>

          {leaderboard.length === 0 ? (
            <p className="mt-8 text-2xl text-white/65">
              Aún no se registraron puntajes en esta ronda.
            </p>
          ) : (
            <>
              {/* Top 3 Podium */}
              <div className="mx-auto mt-10 grid max-w-4xl grid-cols-3 items-end gap-4 sm:gap-6">
                {/* 2nd place (left) */}
                <div className="flex flex-col items-center">
                  {second && podiumStep >= 2 ? (
                    <div className="animate-stage-podium-rise flex w-full flex-col items-center">
                      <p className="mb-3 max-w-full truncate font-(family-name:--font-display) text-2xl font-bold text-white sm:text-3xl">
                        {second.alias}
                      </p>
                      <div className="flex min-h-40 w-full flex-col items-center justify-between rounded-t-3xl border border-b-0 border-slate-300/35 bg-gradient-to-b from-slate-200/20 to-[#0c101a] p-5 sm:min-h-48">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-slate-950">
                          <MedalIcon size={24} />
                        </span>
                        <div>
                          <p className="font-mono text-xs tracking-[0.2em] text-slate-300 uppercase">
                            2.° lugar
                          </p>
                          <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums sm:text-3xl">
                            {second.score}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-40 w-full sm:min-h-48" />
                  )}
                </div>

                {/* 1st place (center, tallest) */}
                <div className="flex flex-col items-center">
                  {first && podiumStep >= 3 ? (
                    <div className="animate-stage-podium-rise flex w-full flex-col items-center">
                      <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--ochre)/20 text-(--ochre)">
                        <CrownIcon size={30} />
                      </span>
                      <p className="mb-3 max-w-full truncate font-(family-name:--font-display) text-3xl font-bold text-(--ochre) sm:text-5xl">
                        {first.alias}
                      </p>
                      <div className="flex min-h-56 w-full flex-col items-center justify-between rounded-t-3xl border border-b-0 border-(--ochre)/70 bg-gradient-to-b from-(--ochre)/30 to-[#0e1018] p-6 shadow-[0_-18px_60px_-20px_rgba(212,173,98,0.4)] sm:min-h-64">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-(--ochre) text-(--ochre-ink)">
                          <TrophyIcon size={28} />
                        </span>
                        <div>
                          <p className="font-mono text-sm font-semibold tracking-[0.2em] text-(--ochre) uppercase">
                            1.° lugar
                          </p>
                          <p className="mt-1 font-mono text-3xl font-bold text-white tabular-nums sm:text-4xl">
                            {first.score} pts
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-56 w-full sm:min-h-64" />
                  )}
                </div>

                {/* 3rd place (right) */}
                <div className="flex flex-col items-center">
                  {third && podiumStep >= 1 ? (
                    <div className="animate-stage-podium-rise flex w-full flex-col items-center">
                      <p className="mb-3 max-w-full truncate font-(family-name:--font-display) text-2xl font-bold text-white sm:text-3xl">
                        {third.alias}
                      </p>
                      <div className="flex min-h-32 w-full flex-col items-center justify-between rounded-t-3xl border border-b-0 border-amber-500/40 bg-gradient-to-b from-amber-500/20 to-[#0c101a] p-5 sm:min-h-36">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/90 text-black">
                          <MedalIcon size={22} />
                        </span>
                        <div>
                          <p className="font-mono text-xs tracking-[0.2em] text-amber-300 uppercase">
                            3.° lugar
                          </p>
                          <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums sm:text-3xl">
                            {third.score}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-32 w-full sm:min-h-36" />
                  )}
                </div>
              </div>

              {/* Base line under podium */}
              <div
                className="from-google-blue to-google-green mx-auto h-1.5 max-w-4xl rounded-full bg-gradient-to-r via-(--ochre)"
                aria-hidden="true"
              />

              {/* Ranks #4 - #10 */}
              {runnersUp.length > 0 && podiumStep >= 3 && (
                <div className="animate-stage-winner-in mx-auto mt-8 max-w-4xl">
                  <h3 className="text-left font-mono text-xs font-semibold tracking-[0.2em] text-white/55 uppercase">
                    Clasificación general
                  </h3>
                  <ol className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {runnersUp.map((entry, i) => (
                      <li
                        key={entry.uid}
                        className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0d13] px-5 py-3 text-xl"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="font-mono text-base text-white/50 tabular-nums">
                            #{i + 4}
                          </span>
                          <span className="truncate font-semibold text-white">
                            {entry.alias}
                          </span>
                        </span>
                        <span className="font-mono font-bold text-(--ochre) tabular-nums">
                          {entry.score}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // --- WAITING LOBBY ---
  if (!question) {
    const totalPlayers = aggregates?.totalParticipants ?? 0;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
        <span className="border-google-red/40 bg-google-red/15 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm font-semibold tracking-[0.18em] text-red-200 uppercase">
          Quiz en vivo · {config.questions.length} pregunta
          {config.questions.length !== 1 ? "s" : ""}
        </span>
        <h2 className="font-(family-name:--font-display) text-4xl font-bold tracking-tight text-white sm:text-6xl">
          {instance.title}
        </h2>
        <p className="max-w-xl text-xl text-white/70 sm:text-2xl">
          Esperando que el organizador inicie la primera pregunta…
        </p>
        {totalPlayers > 0 && (
          <div className="mt-2 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-[#0b0d13] px-6 py-3 font-mono text-xl text-white tabular-nums">
            <UsersIcon size={22} className="text-(--ochre)" />
            <span>
              {totalPlayers} jugador{totalPlayers !== 1 ? "es" : ""} listo
              {totalPlayers !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    );
  }

  // --- ACTIVE QUESTION & REVEALED ANSWER ---
  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = question.options.reduce(
    (sum, opt) => sum + (counts[`${question.id}:${opt.id}`] ?? 0),
    0
  );
  const urgent = !revealedAnswer && remainingSec > 0 && remainingSec <= 5;
  const isLastQuestion = idx === config.questions.length - 1;

  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      {/* Top Question Header + Fluid Timer Bar */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold tracking-[0.18em] text-(--ochre) uppercase">
              Pregunta {idx + 1} de {config.questions.length} ·{" "}
              <span className="text-white/70">{instance.title}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {revealedAnswer && (
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 font-mono text-sm text-white/80 tabular-nums">
                {totalForQuestion} respuesta{totalForQuestion !== 1 ? "s" : ""}
              </span>
            )}
            <span
              className={`rounded-2xl border px-5 py-2 font-mono text-3xl font-bold tabular-nums sm:text-4xl ${
                revealedAnswer
                  ? "border-white/15 bg-white/5 text-white/60"
                  : urgent
                    ? "animate-stage-urgent border-red-400 bg-red-500/20 text-red-200"
                    : "border-white/20 bg-[#0b0d13] text-white"
              }`}
              aria-label="Tiempo restante"
            >
              {remainingSec}s
            </span>
          </div>
        </div>

        {/* Smooth depleting progress bar */}
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10"
          aria-hidden="true"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-150 ease-linear motion-reduce:transition-none ${
              urgent
                ? "bg-google-red"
                : revealedAnswer
                  ? "bg-white/25"
                  : "bg-(--ochre)"
            }`}
            style={{ width: `${revealedAnswer ? 0 : pctRemaining}%` }}
          />
        </div>

        {/* Question Prompt */}
        <p className="mt-6 max-w-[30ch] font-(family-name:--font-display) text-3xl leading-[1.08] font-bold tracking-tight text-balance text-white sm:text-5xl lg:text-[3.5rem]">
          {question.prompt}
        </p>
      </div>

      {/* Answer Options 2x2 Grid */}
      <ul className="grid gap-4 lg:grid-cols-2">
        {question.options.map((opt, index) => {
          const count = counts[`${question.id}:${opt.id}`] ?? 0;
          const pct =
            totalForQuestion > 0
              ? Math.round((count / totalForQuestion) * 100)
              : 0;
          const isCorrect = opt.id === revealedAnswer;
          const revealCorrect = Boolean(revealedAnswer) && isCorrect;
          const dimmed = Boolean(revealedAnswer) && !isCorrect;
          const colorClass = OPTION_STYLES[index % OPTION_STYLES.length];

          return (
            <li
              key={opt.id}
              className={`relative flex min-h-24 items-center overflow-hidden rounded-2xl px-6 py-5 transition-opacity duration-300 ${colorClass} ${
                revealCorrect
                  ? "ring-4 ring-white ring-offset-4 ring-offset-black"
                  : ""
              } ${dimmed ? "opacity-35" : ""}`}
            >
              {revealedAnswer && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-black/20 transition-[width] duration-700 motion-reduce:transition-none"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex w-full items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-4 text-2xl font-bold sm:text-3xl">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/20 font-mono text-lg">
                    <OptionShapeIcon index={index} size={18} />
                  </span>
                  <span className="sr-only">
                    {String.fromCharCode(65 + index)}.{" "}
                  </span>
                  <span className="break-words">{opt.label}</span>
                </span>

                {revealedAnswer && (
                  <span className="flex shrink-0 items-center gap-3 font-mono text-xl font-bold tabular-nums sm:text-2xl">
                    {revealCorrect && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-3 py-1 text-sm font-semibold">
                        <CheckIcon size={16} />
                        Correcto
                      </span>
                    )}
                    <span>
                      {count} · {pct}%
                    </span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Revealed Leaderboard Strip */}
      {revealedAnswer && leaderboard.length > 0 && (
        <div className="animate-stage-winner-in rounded-3xl border border-white/15 bg-[#0b0d13] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 font-mono text-xs font-semibold tracking-[0.2em] text-(--ochre) uppercase sm:text-sm">
              Clasificación
            </h3>
            {isLastQuestion && (
              <span className="font-mono text-xs text-white/60">
                Última pregunta · Listo para podio final
              </span>
            )}
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {leaderboard.slice(0, 5).map((entry, i) => (
              <li
                key={entry.uid}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  i === 0
                    ? "border-(--ochre)/55 bg-(--ochre)/12 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/90"
                }`}
              >
                <span className="truncate text-lg font-semibold">
                  {i + 1}. {entry.alias}
                </span>
                <span className="shrink-0 font-mono text-lg font-bold tabular-nums">
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
