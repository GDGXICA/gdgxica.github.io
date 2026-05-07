import { useMemo, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import {
  CARD_SIZE,
  CELL_COUNT,
  detectBingoWin,
  emptyMarked,
} from "@/lib/bingo";
import { useParticipantDoc } from "./useParticipantDoc";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  title: string;
}

export function BingoCardView({ slug, instanceId, uid, title }: Props) {
  const { doc: participant, loading } = useParticipantDoc(
    slug,
    instanceId,
    uid
  );
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const card = participant?.bingoCard ?? [];
  const marked = useMemo(
    () => participant?.bingoMarked ?? emptyMarked(),
    [participant?.bingoMarked]
  );

  const hasWonBefore = Boolean(participant?.bingoWonAt);
  const winningLines = useMemo(
    () => (marked.length === CELL_COUNT ? detectBingoWin(marked) : []),
    [marked]
  );
  const winningIndices = useMemo(() => {
    const set = new Set<number>();
    for (const line of winningLines) for (const i of line) set.add(i);
    return set;
  }, [winningLines]);

  async function toggle(index: number) {
    if (pendingIndex !== null) return;
    if (card.length !== CELL_COUNT) return;
    const nextMarked = [...marked];
    if (nextMarked.length !== CELL_COUNT) {
      while (nextMarked.length < CELL_COUNT) nextMarked.push(false);
    }
    nextMarked[index] = !nextMarked[index];

    setPendingIndex(index);
    setError(null);
    try {
      const db = await getFirestore();
      const { doc, setDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );
      const ref = doc(
        db,
        `events/${slug}/minigames/${instanceId}/participants/${uid}`
      );
      const justWon = !hasWonBefore && detectBingoWin(nextMarked).length > 0;
      const payload: Record<string, unknown> = { bingoMarked: nextMarked };
      if (justWon) payload.bingoWonAt = serverTimestamp();
      await setDoc(ref, payload, { merge: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar");
    } finally {
      setPendingIndex(null);
    }
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary text-2xl font-semibold">{title}</h2>
        {hasWonBefore && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            🎉 ¡Bingo!
          </span>
        )}
      </div>
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
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              disabled={pendingIndex === index}
              aria-pressed={isMarked}
              className={`flex aspect-square items-center justify-center rounded-lg border p-2 text-center text-xs font-medium transition disabled:opacity-50 sm:text-sm ${
                isMarked
                  ? isWinning
                    ? "border-yellow-400 bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-100"
                    : "border-blue-400 bg-blue-100 text-blue-900 dark:bg-blue-500/30 dark:text-blue-100"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <span className="line-clamp-3 break-words">{term}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
        Toca una celda cuando el speaker mencione el término.
      </p>
    </div>
  );
}
