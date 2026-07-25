import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getFirestore } from "@/lib/firebase";
import {
  CARD_SIZE,
  CELL_COUNT,
  detectBingoWin,
  emptyMarked,
} from "@/lib/bingo";
import { useParticipantDoc } from "./useParticipantDoc";
import type { LiveInstance } from "./types";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  title: string;
  // Live instance doc. Classic mode reads the called balls from it; in
  // conference mode there is nothing to read, so it stays optional.
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

  // What the player has tapped but the server has not confirmed yet, and
  // the writer state that keeps those taps in order. See `toggle` for why
  // this exists rather than a simple "one write at a time" lock.
  const [optimistic, setOptimistic] = useState<boolean[] | null>(null);
  const desiredRef = useRef<boolean[] | null>(null);
  const writingRef = useRef(false);

  const isClassic = instance?.config?.classic === true;
  const prizes = (instance?.config?.prizes as number | undefined) ?? 3;

  const card = participant?.bingoCard ?? [];
  const serverMarked = useMemo(() => {
    const stored = participant?.bingoMarked ?? emptyMarked();
    if (stored.length === CELL_COUNT) return stored;
    // Pad a short array rather than throwing in detectBingoWin below.
    const padded = [...stored];
    while (padded.length < CELL_COUNT) padded.push(false);
    return padded.slice(0, CELL_COUNT);
  }, [participant?.bingoMarked]);

  // Render the player's own taps immediately; fall back to the server's
  // record once there is nothing in flight.
  const marked = optimistic ?? serverMarked;

  // Balls already called out loud. Only these may be marked in classic
  // mode — the server enforces the same rule when verifying a claim, so a
  // hand-crafted write buys nothing.
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

  // In classic mode a line only counts if every cell in it was actually
  // called, so the claim button never invites a request the server will
  // refuse.
  const claimableLine = useMemo(() => {
    if (!isClassic || hasWonBefore) return false;
    return winningLines.some((line) =>
      line.every((cell) => called.has(card[cell]))
    );
  }, [isClassic, hasWonBefore, winningLines, called, card]);

  // Records a tap and schedules the write.
  //
  // Taps must never be dropped. The card lights up the moment the local
  // Firestore cache echoes a write — before setDoc resolves against the
  // server — so a player who taps a cell, sees it turn blue and moves on
  // to the next one is tapping while the previous write is still in
  // flight. A plain "one write at a time, ignore the rest" lock silently
  // swallowed every other tap in that rhythm (measured in a browser: 51ms,
  // stuck, 51ms, stuck) and gave no hint that half the marks were gone.
  // Somebody joining a classic game late has a handful of already-called
  // cells to catch up on and taps them in exactly that rhythm.
  //
  // So the intended card lives in a ref, every tap updates it, and a
  // single writer drains it — coalescing a burst into one write. Writing
  // the array wholesale is also why parallel writes are not the answer:
  // two of them racing would each clobber the other's cell.
  function toggle(index: number) {
    if (card.length !== CELL_COUNT) return;
    // Classic mode: a cell opens up only once its term has been called.
    if (isClassic && !called.has(card[index]) && marked[index] !== true) return;

    const base = desiredRef.current ?? marked;
    const next = [...base];
    next[index] = !next[index];
    desiredRef.current = next;
    setOptimistic(next);
    setError(null);
    void flush();
  }

  async function flush() {
    if (writingRef.current) return; // the running writer will pick this up
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
        // Conference mode has nobody calling terms, so completing a line is
        // the win and the client records it (firestore.rules re-checks the
        // line). Classic mode routes the win through /bingo/claim instead —
        // the rules there reject a client-written bingoWonAt outright.
        const justWon =
          !isClassic && !hasWonBefore && detectBingoWin(nextMarked).length > 0;
        const payload: Record<string, unknown> = { bingoMarked: nextMarked };
        if (justWon) payload.bingoWonAt = serverTimestamp();
        // Cleared before awaiting, so a tap that lands mid-write queues
        // the next pass instead of being lost.
        desiredRef.current = null;
        await setDoc(ref, payload, { merge: true });
      }
      // Nothing queued any more: hand the card back to the server's own
      // record so the two cannot drift apart.
      setOptimistic(null);
    } catch (err) {
      // Drop the optimistic view as well — the marks did not land, and
      // showing them as though they had would be a lie.
      desiredRef.current = null;
      setOptimistic(null);
      setError(err instanceof Error ? err.message : "No pudimos guardar");
    } finally {
      writingRef.current = false;
    }
  }

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    const res = await api.claimBingo(slug, instanceId);
    if (!res.success) {
      setError(res.error || "No pudimos registrar tu bingo");
    }
    setClaiming(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8 text-sm text-gray-500">
        Cargando tu cartón...
      </div>
    );
  }

  if (card.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        No tienes un cartón de bingo asignado todavía. Cierra esta pestaña y
        vuelve a entrar a la página del evento.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-primary text-2xl font-semibold">{title}</h2>
        {hasWonBefore && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            {rank > 0
              ? `🎉 ¡Bingo! Puesto ${rank}${rank <= prizes ? " · premio" : ""}`
              : "🎉 ¡Bingo!"}
          </span>
        )}
      </div>

      {isClassic && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          <div>
            <p className="text-xs tracking-widest text-gray-500 uppercase dark:text-gray-400">
              Última bola
            </p>
            <p className="text-primary text-xl font-bold">
              {instance?.lastDrawnTerm ?? "—"}
            </p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {instance?.drawCount ?? 0} bola
            {(instance?.drawCount ?? 0) !== 1 && "s"} cantada
            {(instance?.drawCount ?? 0) !== 1 && "s"}
          </p>
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${CARD_SIZE}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Cartón de bingo"
      >
        {card.map((term, index) => {
          const isMarked = marked[index] === true;
          const isWinning = winningIndices.has(index);
          // Called but not yet ticked: nudge without marking it for them,
          // because noticing the ball is the game.
          const isPending = isClassic && !isMarked && called.has(term);
          const isLocked = isClassic && !isMarked && !called.has(term);
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              // Only a cell whose ball has not been called is unusable.
              // A write in flight no longer disables anything: the tap is
              // queued, so blocking the cell would just make the player
              // think the app missed them.
              disabled={isLocked}
              aria-pressed={isMarked}
              aria-label={isLocked ? `${term} (aún no cantado)` : term}
              className={`flex aspect-square items-center justify-center rounded-lg border p-2 text-center text-xs font-medium transition disabled:opacity-50 sm:text-sm ${
                isMarked
                  ? isWinning
                    ? "border-yellow-400 bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-100"
                    : "border-blue-400 bg-blue-100 text-blue-900 dark:bg-blue-500/30 dark:text-blue-100"
                  : isPending
                    ? "border-green-500 bg-green-50 text-green-900 ring-2 ring-green-400/60 dark:bg-green-900/20 dark:text-green-200"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <span className="line-clamp-3 break-words">{term}</span>
            </button>
          );
        })}
      </div>

      {claimableLine && (
        <button
          type="button"
          onClick={claim}
          disabled={claiming}
          className="bg-google-green mt-4 w-full rounded-xl px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
        >
          {claiming ? "Cantando..." : "🎉 ¡BINGO!"}
        </button>
      )}

      <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
        {isClassic
          ? "Marca las casillas que vayan cantando. Cuando completes una línea, pulsa ¡BINGO!"
          : "Toca una celda cuando el speaker mencione el término."}
      </p>
    </div>
  );
}
