import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  CARD_SIZE,
  CELL_COUNT,
  detectBingoWin,
  emptyMarked,
} from "@/lib/bingo";
import { getFirestore } from "@/lib/firebase";
import { StageConfetti } from "./StageConfetti";
import { TrophyIcon } from "./icons";
import type { LiveInstance } from "./types";
import { useParticipantDoc } from "./useParticipantDoc";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  title: string;
  instance?: LiveInstance;
}

export function BingoCardView({
  slug,
  instanceId,
  uid,
  title,
  instance,
}: Props) {
  const { doc: participant, loading } = useParticipantDoc(
    slug,
    instanceId,
    uid
  );
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const [optimistic, setOptimistic] = useState<boolean[] | null>(null);
  const desiredRef = useRef<boolean[] | null>(null);
  const writingRef = useRef(false);

  const isClosed = instance?.state === "closed";
  const isClassic = instance?.config?.classic === true;
  const prizes = (instance?.config?.prizes as number | undefined) ?? 3;

  const card = participant?.bingoCard ?? [];
  const serverMarked = useMemo(() => {
    const stored = participant?.bingoMarked ?? emptyMarked();
    if (stored.length === CELL_COUNT) return stored;
    const padded = [...stored];
    while (padded.length < CELL_COUNT) padded.push(false);
    return padded.slice(0, CELL_COUNT);
  }, [participant?.bingoMarked]);

  const marked = optimistic ?? serverMarked;

  const called = useMemo(
    () => new Set(instance?.drawnTerms ?? []),
    [instance?.drawnTerms]
  );

  const hasWonBefore = Boolean(participant?.bingoWonAt);
  const rank = participant?.bingoRank ?? 0;
  const winningLines = useMemo(
    () => (marked.length === CELL_COUNT ? detectBingoWin(marked) : []),
    [marked]
  );
  const winningIndices = useMemo(() => {
    const set = new Set<number>();
    for (const line of winningLines) for (const i of line) set.add(i);
    return set;
  }, [winningLines]);

  const claimableLine = useMemo(() => {
    if (!isClassic || hasWonBefore || isClosed) return false;
    return winningLines.some((line) =>
      line.every((cell) => called.has(card[cell]))
    );
  }, [isClassic, hasWonBefore, isClosed, winningLines, called, card]);

  function toggle(index: number) {
    if (isClosed || card.length !== CELL_COUNT) return;
    if (isClassic && !called.has(card[index]) && marked[index] !== true) return;

    navigator.vibrate?.(10);
    const base = desiredRef.current ?? marked;
    const next = [...base];
    next[index] = !next[index];
    desiredRef.current = next;
    setOptimistic(next);
    setError(null);
    void flush();
  }

  async function flush() {
    if (writingRef.current) return;
    writingRef.current = true;
    try {
      const db = await getFirestore();
      const { doc, setDoc, serverTimestamp } =
        await import("firebase/firestore");
      const ref = doc(
        db,
        `events/${slug}/minigames/${instanceId}/participants/${uid}`
      );
      while (desiredRef.current) {
        const nextMarked = desiredRef.current;
        const justWon =
          !isClassic && !hasWonBefore && detectBingoWin(nextMarked).length > 0;
        const payload: Record<string, unknown> = { bingoMarked: nextMarked };
        if (justWon) payload.bingoWonAt = serverTimestamp();
        desiredRef.current = null;
        await setDoc(ref, payload, { merge: true });
      }
      setOptimistic(null);
    } catch (err) {
      desiredRef.current = null;
      setOptimistic(null);
      setError(err instanceof Error ? err.message : "No pudimos guardar");
    } finally {
      writingRef.current = false;
    }
  }

  async function claim() {
    if (claiming || isClosed) return;
    setClaiming(true);
    setError(null);
    const res = await api.claimBingo(slug, instanceId);
    if (!res.success) {
      setError(res.error || "No pudimos registrar tu bingo");
    } else {
      navigator.vibrate?.([40, 30, 80]);
    }
    setClaiming(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8 text-[0.9375rem] text-(--muted)">
        Cargando tu cartón...
      </div>
    );
  }

  if (card.length === 0) {
    return (
      <p className="py-6 text-center text-[0.9375rem] text-(--muted)">
        {isClosed
          ? "Este bingo ya finalizó."
          : "No tienes un cartón de bingo asignado todavía. Cierra esta pestaña y vuelve a entrar a la página del evento."}
      </p>
    );
  }

  return (
    <div>
      {hasWonBefore && <StageConfetti burstKey={`bingo-${rank}`} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-(family-name:--font-display) text-[clamp(1.5rem,1.25rem+1.2vw,2.1rem)] leading-tight font-bold text-(--ink)">
          {title}
        </h2>
        {hasWonBefore && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(--ochre) px-3.5 py-1 text-sm font-bold text-(--ochre-ink)">
            <TrophyIcon size={15} />
            {rank > 0
              ? `¡Bingo! Puesto ${rank}${rank <= prizes ? " · premio" : ""}`
              : "¡Bingo!"}
          </span>
        )}
      </div>

      {isClassic && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--line) bg-(--surface-2) px-4 py-3">
          <div>
            <p className="m-0 font-mono text-xs tracking-wider text-(--muted) uppercase">
              Última bola
            </p>
            <p className="m-0 mt-0.5 font-(family-name:--font-display) text-2xl font-bold text-(--ochre)">
              {instance?.lastDrawnTerm ?? "—"}
            </p>
          </div>
          <p className="n-mono m-0 text-sm text-(--muted)">
            {instance?.drawCount ?? 0} bola
            {(instance?.drawCount ?? 0) !== 1 && "s"} cantada
            {(instance?.drawCount ?? 0) !== 1 && "s"}
          </p>
        </div>
      )}

      {error && (
        <p
          className="mb-3 border-l-2 border-red-400 pl-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      <div
        className="grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${CARD_SIZE}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Cartón de bingo"
      >
        {card.map((term, index) => {
          const isMarked = marked[index] === true;
          const isWinning = winningIndices.has(index);
          const isPending = isClassic && !isMarked && called.has(term);
          const isLocked =
            isClosed || (isClassic && !isMarked && !called.has(term));
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              disabled={isLocked}
              aria-pressed={isMarked}
              aria-label={isLocked ? `${term} (aún no cantado)` : term}
              className={`flex aspect-square min-h-13 touch-manipulation items-center justify-center rounded-xl border p-1.5 text-center text-[0.75rem] leading-[1.15] font-semibold transition-[background-color,border-color,transform] select-none enabled:active:scale-[0.96] disabled:opacity-55 sm:p-2 sm:text-[0.9375rem] sm:leading-tight ${
                isMarked
                  ? isWinning
                    ? "border-(--ochre) bg-(--ochre) text-(--ochre-ink)"
                    : "border-(--ochre) bg-(--ochre)/22 text-(--ink)"
                  : isPending
                    ? "border-(--g-green) bg-(--surface-2) text-(--ink) ring-2 ring-(--g-green)/60"
                    : "border-(--line) bg-(--surface-2) text-(--muted) hover:border-(--line-strong) hover:bg-(--surface-3) hover:text-(--ink)"
              }`}
            >
              <span className="line-clamp-3 [overflow-wrap:anywhere] hyphens-auto">
                {term}
              </span>
            </button>
          );
        })}
      </div>

      {claimableLine && (
        <button
          type="button"
          onClick={claim}
          disabled={claiming}
          className="nb nb--primary sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mt-5 w-full touch-manipulation shadow-[0_12px_32px_-8px_rgb(0_0_0/0.8)] disabled:opacity-60"
        >
          <span className="nb__label">
            {claiming ? "Cantando..." : "¡BINGO!"}
          </span>
        </button>
      )}

      <p className="mt-4 text-center text-sm text-(--muted)">
        {isClosed
          ? "Este bingo ha finalizado."
          : isClassic
            ? "Marca las casillas que vayan cantando. Cuando completes una línea, pulsa ¡BINGO!"
            : "Toca una celda cuando el speaker mencione el término."}
      </p>
    </div>
  );
}
