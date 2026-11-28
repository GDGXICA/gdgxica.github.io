import { useEffect, useMemo, useRef, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import { StageConfetti } from "../StageConfetti";
import {
  CrownIcon,
  MedalIcon,
  SparkleIcon,
  TrophyIcon,
  UsersIcon,
} from "../icons";
import { playWheelTick, playWinnerFanfare } from "../stageAudio";
import { ROULETTE_SPIN_DURATION_MS, type LiveInstance } from "../types";
import { useAggregates } from "../useAggregates";

export { ROULETTE_SPIN_DURATION_MS };
const CELEBRATION_TO_SUMMARY_MS = 4500;
const MAX_WHEEL_SEGMENTS = 16;

interface SampleParticipant {
  uid: string;
  alias: string;
}

interface WheelSlice {
  index: number;
  uid: string | null;
  label: string;
  fill: string;
  text: string;
}

const WHEEL_PALETTE = [
  { fill: "#2463eb", text: "#ffffff" }, // Google Blue
  { fill: "#ef4444", text: "#ffffff" }, // Google Red
  { fill: "#ebb308", text: "#070b16" }, // Google Yellow
  { fill: "#16a34a", text: "#ffffff" }, // Google Green
];

function slotIndexForId(id: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

function sliceColors(count: number): { fill: string; text: string }[] {
  const result: { fill: string; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    let colorIdx = i % WHEEL_PALETTE.length;
    // Prevent last slice from colliding with first slice on odd/4n+1 counts.
    if (i === count - 1 && count > 1 && colorIdx === 0) {
      colorIdx = 2;
    }
    result.push(WHEEL_PALETTE[colorIdx]);
  }
  return result;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function wedgePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function truncateLabel(label: string, max: number): string {
  const clean = label.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface Props {
  slug: string;
  instance: LiveInstance;
  onFocusModeChange?: (focused: boolean) => void;
}

export function ProjectorRoulette({
  slug,
  instance,
  onFocusModeChange,
}: Props) {
  const { aggregates, loading } = useAggregates(slug, instance.id);
  const [sampleEligible, setSampleEligible] = useState<SampleParticipant[]>([]);

  const prize = (instance.config?.prize as string | undefined)?.trim() || "";
  const configuredWinners = instance.config?.winnersCount;
  const targetWinners =
    typeof configuredWinners === "number" && configuredWinners > 0
      ? configuredWinners
      : null;

  const isClosed = instance.state === "closed";
  const currentSpinCount = instance.spinCount ?? 0;
  const winners = aggregates?.winners ?? [];
  const eligibleCount = aggregates?.eligibleCount ?? 0;
  const sampleRefreshKey =
    eligibleCount <= MAX_WHEEL_SEGMENTS ? eligibleCount : MAX_WHEEL_SEGMENTS;

  useEffect(() => {
    if (sampleRefreshKey <= 0) {
      setSampleEligible([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = await getFirestore();
        const { collection, getDocs, limit, query } =
          await import("firebase/firestore");
        if (cancelled) return;
        const snap = await getDocs(
          query(
            collection(
              db,
              `events/${slug}/minigames/${instance.id}/participants`
            ),
            limit(MAX_WHEEL_SEGMENTS * 2)
          )
        );
        if (cancelled) return;
        const next: SampleParticipant[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as {
            alias?: string;
            rouletteWonAt?: unknown;
          };
          if (data.rouletteWonAt === null || data.rouletteWonAt === undefined) {
            next.push({ uid: docSnap.id, alias: data.alias ?? "Anónimo" });
          }
        }
        setSampleEligible(next);
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, instance.id, sampleRefreshKey, currentSpinCount]);

  const liveEligible = sampleEligible;

  const [revealedSpinCount, setRevealedSpinCount] = useState(currentSpinCount);
  const [rotation, setRotation] = useState(0);
  const [lockedSlices, setLockedSlices] = useState<WheelSlice[] | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [summaryMode, setSummaryMode] = useState(
    () =>
      isClosed || (targetWinners !== null && currentSpinCount >= targetWinners)
  );
  const [tickerName, setTickerName] = useState<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const spinFrameRef = useRef<number | null>(null);
  const spinTimeoutRef = useRef<number | null>(null);
  const summaryTimeoutRef = useRef<number | null>(null);
  const tickTimersRef = useRef<number[]>([]);
  const tickerIntervalRef = useRef<number | null>(null);
  const activeSpinStartedRef = useRef<number>(currentSpinCount);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    setReducedMotion(media.matches);
    const change = () => setReducedMotion(media.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);

  // Derive pending spin synchronously BEFORE paint so the new winner NEVER
  // flashes for even a single frame before the animation begins.
  const isPendingSpin = currentSpinCount > revealedSpinCount;
  const spinning = isPendingSpin && !reducedMotion;

  const visibleWinners = useMemo(
    () =>
      (isPendingSpin
        ? winners.filter((w) => w.spinNumber <= revealedSpinCount)
        : winners
      )
        .slice()
        .sort((a, b) => a.spinNumber - b.spinNumber),
    [winners, isPendingSpin, revealedSpinCount]
  );

  const revealedWinner = useMemo(() => {
    if (isPendingSpin || revealedSpinCount <= 0) return null;
    const matched = winners.find((w) => w.spinNumber === revealedSpinCount);
    if (matched) return matched;
    if (
      instance.lastSpinWinnerAlias &&
      currentSpinCount === revealedSpinCount
    ) {
      return {
        uid: instance.lastSpinWinnerId ?? "winner",
        alias: instance.lastSpinWinnerAlias,
        spinNumber: revealedSpinCount,
      };
    }
    return null;
  }, [
    isPendingSpin,
    revealedSpinCount,
    winners,
    instance.lastSpinWinnerAlias,
    instance.lastSpinWinnerId,
    currentSpinCount,
  ]);

  // Build visual wheel slots from live eligible participants. Only add the
  // just-picked winner back into the slice list when we ALREADY have other
  // participant names loaded — otherwise a single winner name on an unlabeled
  // wheel would spoil the result while spinning!
  const computedWheelSlices = useMemo<WheelSlice[]>(() => {
    // Exclude any winner from strictly earlier spins so back-to-back spins
    // never keep a previous winner on the wheel even before Firestore refetches.
    const priorWinnerIds = new Set(
      winners.filter((w) => w.spinNumber < currentSpinCount).map((w) => w.uid)
    );
    const poolNames: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const p of liveEligible) {
      if (priorWinnerIds.has(p.uid)) continue;
      if (!seen.has(p.uid)) {
        seen.add(p.uid);
        poolNames.push({ id: p.uid, label: p.alias });
      }
    }
    if (
      poolNames.length > 0 &&
      instance.lastSpinWinnerId &&
      instance.lastSpinWinnerAlias &&
      !priorWinnerIds.has(instance.lastSpinWinnerId) &&
      !seen.has(instance.lastSpinWinnerId)
    ) {
      seen.add(instance.lastSpinWinnerId);
      poolNames.push({
        id: instance.lastSpinWinnerId,
        label: instance.lastSpinWinnerAlias,
      });
    }

    const totalPool = Math.max(
      poolNames.length,
      eligibleCount + (revealedWinner ? 1 : 0)
    );
    const count =
      totalPool > 0 ? Math.min(Math.max(totalPool, 4), MAX_WHEEL_SEGMENTS) : 8;
    const colors = sliceColors(count);
    const showLabelsOnWheel =
      eligibleCount <= MAX_WHEEL_SEGMENTS &&
      poolNames.length >= 2 &&
      poolNames.length <= MAX_WHEEL_SEGMENTS;

    return Array.from({ length: count }, (_, i) => ({
      index: i,
      uid: showLabelsOnWheel ? (poolNames[i]?.id ?? null) : null,
      label: showLabelsOnWheel ? (poolNames[i]?.label ?? "") : "",
      fill: colors[i].fill,
      text: colors[i].text,
    }));
  }, [
    liveEligible,
    winners,
    currentSpinCount,
    eligibleCount,
    revealedWinner,
    instance.lastSpinWinnerId,
    instance.lastSpinWinnerAlias,
  ]);

  // Freeze the slice array for the entire duration of a spin + winner
  // celebration so Firestore's async refresh of `sampleEligible` (which
  // removes the winner from eligible docs ~50ms after spin starts) can NEVER
  // shift slice indices underneath the rotating wheel and cause the top
  // pointer to land on the wrong name.
  const wheelSlices = lockedSlices ?? computedWheelSlices;

  const tickerPool = useMemo(() => {
    const names = liveEligible.map((p) => p.alias).filter(Boolean);
    if (names.length > 0) return names;
    return ["GDG ICA", "DevFest", "Participante", "Suerte"];
  }, [liveEligible]);

  // Clear timers on unmount.
  useEffect(
    () => () => {
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      if (spinTimeoutRef.current !== null)
        window.clearTimeout(spinTimeoutRef.current);
      if (summaryTimeoutRef.current !== null)
        window.clearTimeout(summaryTimeoutRef.current);
      if (tickerIntervalRef.current !== null)
        window.clearInterval(tickerIntervalRef.current);
      for (const t of tickTimersRef.current) window.clearTimeout(t);
    },
    []
  );

  // If the game closes (and isn't mid-spin), show final summary table.
  useEffect(() => {
    if (isClosed && !isPendingSpin) {
      setSummaryMode(true);
    }
  }, [isClosed, isPendingSpin]);

  // Reset revealed count if an instance was somehow reset.
  useEffect(() => {
    if (currentSpinCount < revealedSpinCount) {
      setRevealedSpinCount(currentSpinCount);
      activeSpinStartedRef.current = currentSpinCount;
      setLockedSlices(null);
      setSummaryMode(false);
      setCelebrating(false);
    }
  }, [currentSpinCount, revealedSpinCount]);

  // Drive the spin animation whenever a new spin arrives.
  useEffect(() => {
    if (currentSpinCount <= activeSpinStartedRef.current) return;
    activeSpinStartedRef.current = currentSpinCount;

    if (spinFrameRef.current !== null)
      cancelAnimationFrame(spinFrameRef.current);
    if (spinTimeoutRef.current !== null)
      window.clearTimeout(spinTimeoutRef.current);
    if (summaryTimeoutRef.current !== null)
      window.clearTimeout(summaryTimeoutRef.current);
    if (tickerIntervalRef.current !== null)
      window.clearInterval(tickerIntervalRef.current);
    for (const t of tickTimersRef.current) window.clearTimeout(t);
    tickTimersRef.current = [];

    // Leave summary mode if an extra backup spin is triggered.
    setSummaryMode(false);
    setCelebrating(false);

    // Snapshot the wheel slices for this spin so mid-spin Firestore updates
    // cannot shift names under the landing angle.
    const slicesForSpin = computedWheelSlices;
    setLockedSlices(slicesForSpin);

    const winnerId = instance.lastSpinWinnerId ?? `spin-${currentSpinCount}`;
    const slots = Math.max(slicesForSpin.length, 4);
    const step = 360 / slots;
    const matchedIdx = slicesForSpin.findIndex(
      (s) =>
        (s.uid !== null && s.uid === winnerId) ||
        (s.label !== "" && s.label === instance.lastSpinWinnerAlias)
    );
    const targetIdx =
      matchedIdx >= 0 ? matchedIdx : slotIndexForId(winnerId, slots);
    const targetAngle = -((targetIdx + 0.5) * step);

    if (reducedMotion) {
      setRotation(targetAngle);
      setRevealedSpinCount(currentSpinCount);
      setCelebrating(true);
      setConfettiKey((k) => k + 1);
      playWinnerFanfare();
      if (targetWinners !== null && currentSpinCount >= targetWinners) {
        summaryTimeoutRef.current = window.setTimeout(
          () => setSummaryMode(true),
          CELEBRATION_TO_SUMMARY_MS
        );
      }
      return;
    }

    // 6 full rotations + exact landing angle.
    spinFrameRef.current = requestAnimationFrame(() => {
      setRotation(
        (current) =>
          current + 2160 + ((((targetAngle - current) % 360) + 360) % 360)
      );
    });

    // Schedule decelerating wheel peg clicks synced with the 4.6s ease-out.
    const tickCount = 26;
    for (let i = 0; i < tickCount; i++) {
      const progress = i / tickCount;
      // Inverse ease-out spacing: fast ticks early, dramatic slow ticks at end.
      const delayMs = Math.round(
        ROULETTE_SPIN_DURATION_MS * Math.pow(progress, 2.35)
      );
      const id = window.setTimeout(() => {
        playWheelTick(1 - progress * 0.45);
      }, delayMs);
      tickTimersRef.current.push(id);
    }

    // Fast cycling ticker of participant names (strictly excludes spoiling
    // who won by rotating through the pool).
    let tickerIdx = 0;
    setTickerName(tickerPool[0] ?? null);
    tickerIntervalRef.current = window.setInterval(() => {
      tickerIdx = (tickerIdx + 1) % tickerPool.length;
      setTickerName(tickerPool[tickerIdx] ?? null);
    }, 95);

    spinTimeoutRef.current = window.setTimeout(() => {
      if (tickerIntervalRef.current !== null) {
        window.clearInterval(tickerIntervalRef.current);
        tickerIntervalRef.current = null;
      }
      setTickerName(null);
      setRevealedSpinCount(currentSpinCount);
      setCelebrating(true);
      setConfettiKey((k) => k + 1);
      playWinnerFanfare();

      if (targetWinners !== null && currentSpinCount >= targetWinners) {
        summaryTimeoutRef.current = window.setTimeout(() => {
          setSummaryMode(true);
        }, CELEBRATION_TO_SUMMARY_MS);
      }
    }, ROULETTE_SPIN_DURATION_MS);
  }, [
    currentSpinCount,
    instance.lastSpinWinnerId,
    instance.lastSpinWinnerAlias,
    computedWheelSlices,
    reducedMotion,
    targetWinners,
    tickerPool,
  ]);

  const showFinalTable =
    summaryMode && !isPendingSpin && visibleWinners.length > 0;

  useEffect(() => {
    onFocusModeChange?.(showFinalTable || celebrating);
    return () => onFocusModeChange?.(false);
  }, [showFinalTable, celebrating, onFocusModeChange]);

  const goalMet =
    targetWinners !== null && visibleWinners.length >= targetWinners;

  // --- FINAL WINNERS TABLE VIEW ---
  if (showFinalTable) {
    return (
      <div className="relative flex flex-1 flex-col justify-center">
        <StageConfetti burstKey={`summary-${confettiKey}`} />

        <div className="animate-stage-winner-in mx-auto w-full max-w-6xl text-center">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-(--ochre)/40 bg-(--ochre)/10 px-4 py-1.5 font-mono text-sm font-semibold tracking-[0.16em] text-(--ochre) uppercase">
            <TrophyIcon size={16} />
            {isClosed ? "Sorteo finalizado" : "Ganadores completos"}
          </div>

          <h2 className="mt-4 font-(family-name:--font-display) text-4xl font-bold tracking-tight text-white sm:text-6xl">
            {instance.title}
          </h2>

          {prize && (
            <p className="mt-3 text-xl text-white/75 sm:text-2xl">
              Premio:{" "}
              <span className="font-semibold text-(--ochre)">{prize}</span>
            </p>
          )}

          <ol
            className={`mt-10 grid gap-5 text-left ${
              visibleWinners.length === 1
                ? "mx-auto max-w-2xl grid-cols-1"
                : visibleWinners.length === 2
                  ? "mx-auto max-w-4xl sm:grid-cols-2"
                  : visibleWinners.length <= 4
                    ? "sm:grid-cols-2"
                    : "sm:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {visibleWinners.map((w, idx) => {
              const isFirst = idx === 0;
              const accentBorders = [
                "border-(--ochre) bg-gradient-to-br from-(--ochre)/18 via-[#0e111a] to-[#080a10]",
                "border-google-blue/60 bg-gradient-to-br from-google-blue/14 via-[#0e111a] to-[#080a10]",
                "border-google-green/60 bg-gradient-to-br from-google-green/14 via-[#0e111a] to-[#080a10]",
                "border-white/20 bg-[#0e111a]",
              ];
              return (
                <li
                  key={w.uid}
                  className={`animate-stage-winner-in relative flex items-center gap-5 rounded-2xl border p-6 shadow-2xl sm:p-7 ${accentBorders[Math.min(idx, 3)]}`}
                  style={{ animationDelay: `${idx * 110}ms` }}
                >
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-mono text-2xl font-bold ${
                      isFirst
                        ? "bg-(--ochre) text-(--ochre-ink)"
                        : idx === 1
                          ? "bg-google-blue text-white"
                          : idx === 2
                            ? "bg-google-green text-white"
                            : "border border-white/20 bg-white/10 text-white"
                    }`}
                  >
                    {isFirst ? (
                      <CrownIcon size={30} />
                    ) : idx < 3 ? (
                      <MedalIcon size={28} />
                    ) : (
                      `#${idx + 1}`
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold tracking-[0.18em] text-white/55 uppercase">
                      Ganador #{idx + 1} · Giro {w.spinNumber}
                    </p>
                    <p className="mt-1 font-(family-name:--font-display) text-3xl leading-tight font-bold break-words text-white sm:text-4xl">
                      {w.alias}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="mt-8 font-mono text-base text-white/60">
            Acérquense al equipo organizador para reclamar su premio
          </p>
        </div>
      </div>
    );
  }

  // --- LIVE WHEEL VIEW ---
  const stepDeg = 360 / wheelSlices.length;
  const pegs = Array.from({ length: 24 }, (_, i) => {
    const pos = polarToCartesian(200, 200, 189, i * 15);
    return { i, ...pos };
  });

  return (
    <div className="relative flex flex-1 flex-col justify-between gap-6">
      {celebrating && revealedWinner && (
        <StageConfetti burstKey={confettiKey} />
      )}

      {/* Top metadata bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-[0.2em] text-(--ochre) uppercase sm:text-sm">
            Ruleta en vivo
            {targetWinners !== null && (
              <span className="ml-3 text-white/60">
                · {visibleWinners.length} / {targetWinners} ganador
                {targetWinners !== 1 ? "es" : ""}
              </span>
            )}
          </p>
          <h2 className="mt-1 font-(family-name:--font-display) text-3xl leading-none font-bold tracking-tight text-white sm:text-5xl">
            {instance.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {prize && (
            <div className="inline-flex items-center gap-2 rounded-full border border-(--ochre)/35 bg-(--ochre)/10 px-4 py-1.5 text-base font-medium text-(--ochre)">
              <SparkleIcon size={16} />
              <span>{prize}</span>
            </div>
          )}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-1.5 font-mono text-sm text-white/85 tabular-nums">
            <UsersIcon size={16} className="text-white/60" />
            <span>
              {loading ? "…" : eligibleCount} elegible
              {eligibleCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Main Stage: Wheel + Live Status / Winners */}
      <div className="grid flex-1 items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
        {/* SVG Wheel */}
        <div className="flex items-center justify-center">
          <div
            className="relative aspect-square w-full max-w-[min(58vh,500px)]"
            aria-label={`Ruleta con ${eligibleCount} participantes elegibles`}
          >
            {/* Top Pointer */}
            <div className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 drop-shadow-[0_6px_12px_rgba(0,0,0,0.85)]">
              <svg
                width="44"
                height="50"
                viewBox="0 0 44 50"
                aria-hidden="true"
              >
                <path
                  d="M22 48 4 8a5 5 0 0 1 4.5-7h27a5 5 0 0 1 4.5 7Z"
                  fill="#f4f4ee"
                  stroke="#000000"
                  strokeWidth="3"
                />
                <circle cx="22" cy="14" r="4" fill="#d4ad62" />
              </svg>
            </div>

            {/* Outer metallic rim + rotating wheel */}
            <svg
              viewBox="0 0 400 400"
              className="h-full w-full drop-shadow-[0_24px_60px_rgba(0,0,0,0.9)]"
            >
              {/* Static outer ring & pegs */}
              <circle
                cx="200"
                cy="200"
                r="196"
                fill="#0b0d13"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="4"
              />
              {pegs.map((peg) => (
                <circle
                  key={peg.i}
                  cx={peg.x}
                  cy={peg.y}
                  r={peg.i % 2 === 0 ? 3.2 : 2.2}
                  fill={peg.i % 2 === 0 ? "#d4ad62" : "rgba(255,255,255,0.45)"}
                />
              ))}

              {/* Rotating group */}
              <g
                style={{
                  transformOrigin: "200px 200px",
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning
                    ? `transform ${ROULETTE_SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.85, 0.16, 1)`
                    : "none",
                }}
              >
                {wheelSlices.map((slice, idx) => {
                  const start = idx * stepDeg;
                  const end = (idx + 1) * stepDeg;
                  const mid = start + stepDeg / 2;
                  const labelPos = polarToCartesian(200, 200, 124, mid);
                  return (
                    <g key={slice.index}>
                      <path
                        d={wedgePath(200, 200, 178, start, end)}
                        fill={slice.fill}
                        stroke="#000000"
                        strokeWidth="2.5"
                      />
                      {slice.label && (
                        <text
                          x={labelPos.x}
                          y={labelPos.y}
                          fill={slice.text}
                          fontSize={wheelSlices.length > 10 ? 11 : 13}
                          fontWeight="700"
                          textAnchor="middle"
                          dominantBaseline="central"
                          transform={`rotate(${mid - 90}, ${labelPos.x}, ${labelPos.y})`}
                        >
                          {truncateLabel(slice.label, 12)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Center hub */}
              <circle
                cx="200"
                cy="200"
                r="38"
                fill="#000000"
                stroke="#f4f4ee"
                strokeWidth="4"
              />
              <circle cx="191" cy="191" r="6" fill="#2463eb" />
              <circle cx="209" cy="191" r="6" fill="#ef4444" />
              <circle cx="191" cy="209" r="6" fill="#ebb308" />
              <circle cx="209" cy="209" r="6" fill="#16a34a" />
            </svg>
          </div>
        </div>

        {/* Right Column: Live Status / Winner Spotlight + Non-Spoiler Winners List */}
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/15 bg-[#0b0d13] p-6 sm:p-8">
            {loading ? (
              <p className="text-2xl text-white/70">Cargando participantes…</p>
            ) : spinning ? (
              <div role="status" className="space-y-3 text-center lg:text-left">
                <p className="font-mono text-sm font-semibold tracking-[0.2em] text-(--ochre) uppercase">
                  Girando ruleta · Giro #{currentSpinCount}
                </p>
                <p className="font-(family-name:--font-display) text-4xl font-bold text-white sm:text-5xl">
                  {tickerName ? truncateLabel(tickerName, 20) : "¡Girando!"}
                </p>
                <p className="text-lg text-white/60">
                  ¿Quién será el siguiente ganador?
                </p>
              </div>
            ) : revealedWinner ? (
              <div
                key={revealedWinner.spinNumber}
                className="animate-stage-winner-in space-y-3 text-center lg:text-left"
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-(--ochre)/15 px-3.5 py-1 font-mono text-sm font-semibold text-(--ochre)">
                  <TrophyIcon size={16} />
                  <span>
                    Ganador #{revealedWinner.spinNumber}
                    {targetWinners !== null ? ` de ${targetWinners}` : ""}
                  </span>
                </div>
                <p
                  className="font-(family-name:--font-display) text-5xl leading-tight font-bold break-words text-white sm:text-6xl"
                  aria-live="polite"
                >
                  {revealedWinner.alias}
                </p>
                {prize && (
                  <p className="text-lg text-white/70">
                    Premio: <strong className="text-white">{prize}</strong>
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-center lg:text-left">
                <p className="font-mono text-sm tracking-[0.18em] text-white/55 uppercase">
                  Listos para el sorteo
                </p>
                <p className="font-(family-name:--font-display) text-4xl font-bold text-white tabular-nums sm:text-5xl">
                  {eligibleCount} participante{eligibleCount !== 1 ? "s" : ""}
                </p>
                <p className="text-lg text-white/65">
                  Escanea el QR para entrar antes de girar la ruleta.
                </p>
              </div>
            )}
          </div>

          {/* Revealed winners list — strictly excludes any in-flight spin winner */}
          {visibleWinners.length > 0 && (
            <div className="rounded-3xl border border-white/12 bg-[#0b0d13] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs font-semibold tracking-[0.2em] text-white/55 uppercase">
                  Ganadores ({visibleWinners.length}
                  {targetWinners !== null ? ` / ${targetWinners}` : ""})
                </p>
                {goalMet && !isPendingSpin && (
                  <span className="font-mono text-xs font-semibold text-(--ochre)">
                    Mostrando tabla final…
                  </span>
                )}
              </div>
              <ol className="mt-4 space-y-2.5">
                {visibleWinners.map((w, i) => (
                  <li
                    key={w.uid}
                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xl font-semibold text-white sm:text-2xl"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                          i === 0
                            ? "bg-(--ochre) text-(--ochre-ink)"
                            : i === 1
                              ? "bg-google-blue text-white"
                              : i === 2
                                ? "bg-google-green text-white"
                                : "bg-white/10 text-white/80"
                        }`}
                      >
                        #{i + 1}
                      </span>
                      <span className="truncate">{w.alias}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm text-white/50 tabular-nums">
                      Giro #{w.spinNumber}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
