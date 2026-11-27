import { useEffect, useMemo, useRef, useState } from "react";
import { StageConfetti } from "./StageConfetti";
import { CrownIcon, MedalIcon, SparkleIcon, TrophyIcon } from "./icons";
import { ROULETTE_SPIN_DURATION_MS, type LiveInstance } from "./types";
import { useAggregates } from "./useAggregates";
import { useParticipantDoc } from "./useParticipantDoc";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  title: string;
  instance: LiveInstance;
}

export function RouletteView({
  slug,
  instanceId,
  uid,
  title,
  instance,
}: Props) {
  const { doc: participant, loading: participantLoading } = useParticipantDoc(
    slug,
    instanceId,
    uid
  );
  const { aggregates, loading: aggregatesLoading } = useAggregates(
    slug,
    instanceId
  );

  const isClosed = instance.state === "closed";
  const currentSpinCount = instance.spinCount ?? 0;
  const configuredWinners = instance.config?.winnersCount;
  const targetWinners =
    typeof configuredWinners === "number" && configuredWinners > 0
      ? configuredWinners
      : null;

  // Synchronize with projector spin duration so the winner's phone never
  // spoils the result 4.6 seconds before the wheel stops on stage.
  const [revealedSpinCount, setRevealedSpinCount] = useState(currentSpinCount);
  const [justWonBurst, setJustWonBurst] = useState(0);
  const activeSpinRef = useRef(currentSpinCount);
  const timerRef = useRef<number | null>(null);

  const isSpinning = currentSpinCount > revealedSpinCount;

  useEffect(() => {
    if (currentSpinCount < revealedSpinCount) {
      setRevealedSpinCount(currentSpinCount);
      activeSpinRef.current = currentSpinCount;
    }
  }, [currentSpinCount, revealedSpinCount]);

  useEffect(() => {
    if (currentSpinCount <= activeSpinRef.current) return;
    activeSpinRef.current = currentSpinCount;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduced) {
      setRevealedSpinCount(currentSpinCount);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      setRevealedSpinCount(currentSpinCount);
    }, ROULETTE_SPIN_DURATION_MS);
  }, [currentSpinCount]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const allWinners = aggregates?.winners ?? [];
  const visibleWinners = useMemo(
    () =>
      (isSpinning
        ? allWinners.filter((w) => w.spinNumber <= revealedSpinCount)
        : allWinners
      )
        .slice()
        .sort((a, b) => a.spinNumber - b.spinNumber),
    [allWinners, isSpinning, revealedSpinCount]
  );

  // Only reveal this participant's win once their winning spin has finished.
  const myWinnerEntry = visibleWinners.find((w) => w.uid === uid);
  const mySpinNumber = participant?.rouletteSpinNumber ?? null;
  const participantWonBeforePending =
    Boolean(participant?.rouletteWonAt) &&
    (!isSpinning || mySpinNumber === null || mySpinNumber <= revealedSpinCount);
  const myWin =
    !isSpinning &&
    (Boolean(myWinnerEntry) ||
      participantWonBeforePending ||
      instance.lastSpinWinnerId === uid);

  const prevMyWinRef = useRef(myWin);
  useEffect(() => {
    if (myWin && !prevMyWinRef.current) {
      setJustWonBurst((b) => b + 1);
      navigator.vibrate?.([40, 30, 80]);
    }
    prevMyWinRef.current = myWin;
  }, [myWin]);

  const eligibleCount = aggregates?.eligibleCount ?? 0;
  const loading = participantLoading && aggregatesLoading;
  const prize = (instance.config?.prize as string | undefined)?.trim() || "";
  const isFinalSummary =
    !isSpinning &&
    (isClosed ||
      (targetWinners !== null && visibleWinners.length >= targetWinners));

  return (
    <div className="mx-auto max-w-2xl">
      {justWonBurst > 0 && <StageConfetti burstKey={justWonBurst} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 font-(family-name:--font-display) text-[clamp(1.5rem,1.25rem+1.2vw,2.1rem)] leading-tight font-bold text-(--ink)">
            {title}
          </h2>
          {prize && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-(--muted)">
              <SparkleIcon size={15} className="text-(--ochre)" />
              <span>
                Premio:{" "}
                <strong className="font-semibold text-(--ink)">{prize}</strong>
              </span>
            </p>
          )}
        </div>
        {targetWinners !== null && (
          <span className="rounded-full border border-(--line-strong) bg-(--surface-2) px-3 py-1 font-mono text-xs text-(--ochre) tabular-nums">
            {visibleWinners.length} / {targetWinners} ganador
            {targetWinners !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {/* Main Status Card */}
      {isSpinning ? (
        <div
          className="mt-6 rounded-2xl border border-(--ochre)/55 bg-(--surface-2) px-6 py-10 text-center"
          role="status"
        >
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-(--ochre)/30 border-t-(--ochre) motion-safe:animate-spin"
            aria-hidden="true"
          />
          <p className="mt-5 font-(family-name:--font-display) text-2xl font-bold text-(--ink) sm:text-3xl">
            ¡La ruleta está girando!
          </p>
          <p className="mt-2 text-sm text-(--muted) sm:text-base">
            Mira la pantalla del evento… ¡mucha suerte!
          </p>
        </div>
      ) : myWin ? (
        <div
          className="animate-stage-winner-in mt-6 rounded-2xl border-2 border-(--ochre) bg-gradient-to-b from-(--ochre)/20 to-(--surface-2) px-6 py-9 text-center"
          role="status"
        >
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-(--ochre) text-(--ochre-ink)">
            <TrophyIcon size={32} />
          </span>
          <p className="mt-4 font-(family-name:--font-display) text-4xl leading-none font-bold text-(--ink)">
            ¡Ganaste!
          </p>
          {myWinnerEntry && (
            <p className="mt-2 font-mono text-sm font-semibold text-(--ochre)">
              Giro #{myWinnerEntry.spinNumber}
              {prize ? ` · ${prize}` : ""}
            </p>
          )}
          <p className="mt-3 text-sm text-(--muted) sm:text-base">
            Preséntate con el organizador para reclamar tu premio.
          </p>
        </div>
      ) : isFinalSummary ? (
        <div
          className="mt-6 rounded-2xl border border-(--line-strong) bg-(--surface-2) px-6 py-7 text-center"
          role="status"
        >
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-(--ochre)/15 text-(--ochre)">
            <TrophyIcon size={24} />
          </span>
          <p className="mt-3 font-(family-name:--font-display) text-2xl font-bold text-(--ink)">
            Sorteo completado
          </p>
          <p className="mt-1.5 text-sm text-(--muted)">
            ¡Gracias por participar! Estos fueron los ganadores.
          </p>
        </div>
      ) : (
        <div
          className="mt-6 rounded-2xl border border-(--line) bg-(--surface-2) px-6 py-9 text-center"
          role="status"
        >
          <span
            className="mx-auto block h-3 w-3 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="mt-4 font-(family-name:--font-display) text-2xl font-bold text-(--ink)">
            Estás en la ruleta
          </p>
          {loading ? (
            <p className="mt-2 text-sm text-(--muted)">
              Cargando participantes…
            </p>
          ) : (
            <p className="mt-2.5 font-mono text-sm text-(--ochre) tabular-nums">
              {eligibleCount} participante{eligibleCount !== 1 && "s"} elegibles
              · {visibleWinners.length} ganador
              {visibleWinners.length !== 1 && "es"}
            </p>
          )}
          <p className="mt-3 text-sm text-(--muted)">
            Mira la pantalla del evento para seguir el giro.
          </p>
        </div>
      )}

      {/* Winners Table (strictly excludes any in-flight spin) */}
      {visibleWinners.length > 0 && (
        <div className="mt-7 border-t border-(--line) pt-5">
          <h3 className="mt-0 mb-3 font-mono text-xs font-semibold tracking-[0.18em] text-(--ochre) uppercase">
            {isFinalSummary ? "Tabla final de ganadores" : "Ganadores"}
          </h3>
          <ol className="space-y-2">
            {visibleWinners.map((w, i) => {
              const isMe = w.uid === uid;
              return (
                <li
                  key={w.uid}
                  className={`flex min-h-13 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                    isMe
                      ? "border-(--ochre) bg-(--ochre)/15 font-semibold text-(--ochre)"
                      : "border-(--line) bg-(--surface-2) text-(--ink)"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                        i === 0
                          ? "bg-(--ochre) text-(--ochre-ink)"
                          : i === 1
                            ? "bg-google-blue text-white"
                            : i === 2
                              ? "bg-google-green text-white"
                              : "bg-(--surface-3) text-(--muted)"
                      }`}
                    >
                      {i === 0 ? (
                        <CrownIcon size={15} />
                      ) : i < 3 ? (
                        <MedalIcon size={15} />
                      ) : (
                        `#${i + 1}`
                      )}
                    </span>
                    <span className="truncate">
                      {w.alias}
                      {isMe && " (tú)"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-(--muted) tabular-nums">
                    Giro #{w.spinNumber}
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
