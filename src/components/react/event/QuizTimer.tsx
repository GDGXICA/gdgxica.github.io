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
      ? Math.round((100 * remainingMs) / (timeLimitSec * 1000))
      : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="n-mono text-(--muted)">
          Pregunta {questionIndex + 1} de {totalQuestions}
        </span>
        <span
          aria-label="Tiempo restante"
          className={`rounded-(--radius-sm) border px-3 py-1 font-mono text-2xl font-semibold tabular-nums ${remainingMs <= 5000 ? "border-red-400/60 text-red-300" : "border-(--line-strong) text-(--ink)"}`}
        >
          {remainingSec}s
        </span>
      </div>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-(--surface-3)"
        role="progressbar"
        aria-label="Tiempo de la pregunta"
        aria-valuenow={remainingSec}
        aria-valuemin={0}
        aria-valuemax={timeLimitSec}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${remainingMs <= 5000 ? "bg-(--g-red)" : "bg-(--ochre)"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </>
  );
}
