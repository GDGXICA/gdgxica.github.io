import { useEffect, useRef, useState } from "react";
import { getServerNowMs } from "@/lib/serverClock";

interface Props {
  questionId: string;
  questionIndex: number;
  totalQuestions: number;
  timeLimitSec: number;
  startedMs: number | null;
  stopped: boolean;
  onExpire: () => void;
}

function computeRemainingMs(
  timeLimitSec: number,
  startedMs: number | null,
  now: number
): number {
  const limitMs = timeLimitSec * 1000;
  if (startedMs === null) return limitMs;
  return Math.max(0, limitMs - Math.max(0, now - startedMs));
}

export function QuizTimer({
  questionId,
  questionIndex,
  totalQuestions,
  timeLimitSec,
  startedMs,
  stopped,
  onExpire,
}: Props) {
  const [now, setNow] = useState(() => getServerNowMs());
  const expiredNotifiedRef = useRef<string | null>(null);

  const remainingMs = computeRemainingMs(timeLimitSec, startedMs, now);
  const expired = startedMs !== null && remainingMs <= 0;

  useEffect(() => {
    setNow(getServerNowMs());
    expiredNotifiedRef.current = null;
  }, [questionId, startedMs]);

  useEffect(() => {
    if (expired && expiredNotifiedRef.current !== questionId) {
      expiredNotifiedRef.current = questionId;
      onExpire();
    }
  }, [expired, questionId, onExpire]);

  useEffect(() => {
    if (stopped || expired || startedMs === null) return;
    const stepMs = remainingMs <= 5000 ? 250 : 1000;
    const timer = window.setTimeout(() => setNow(getServerNowMs()), stepMs);
    return () => window.clearTimeout(timer);
  }, [stopped, expired, startedMs, remainingMs]);

  const remainingSec = Math.ceil(remainingMs / 1000);
  const pct =
    timeLimitSec > 0
      ? Math.max(0, Math.min(100, (100 * remainingMs) / (timeLimitSec * 1000)))
      : 0;
  const urgent = !stopped && remainingMs > 0 && remainingMs <= 5000;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-semibold tracking-wider text-(--muted) uppercase sm:text-sm">
          Pregunta {questionIndex + 1} de {totalQuestions}
        </span>
        <span
          aria-label="Tiempo restante"
          className={`rounded-xl border px-3.5 py-1 font-mono text-xl font-bold tabular-nums sm:text-2xl ${
            urgent
              ? "animate-stage-urgent border-red-400/70 bg-red-500/15 text-red-200"
              : "border-(--line-strong) bg-(--surface-2) text-(--ink)"
          }`}
        >
          {remainingSec}s
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-(--surface-3)"
        role="progressbar"
        aria-label="Tiempo de la pregunta"
        aria-valuenow={remainingSec}
        aria-valuemin={0}
        aria-valuemax={timeLimitSec}
      >
        <div
          className={`h-full rounded-full transition-[width] ease-linear motion-reduce:transition-none ${
            urgent ? "duration-250" : "duration-1000"
          } ${
            urgent
              ? "bg-(--g-red)"
              : stopped
                ? "bg-(--muted)/40"
                : "bg-(--ochre)"
          }`}
          style={{ width: `${stopped ? 0 : pct}%` }}
        />
      </div>
    </>
  );
}
