import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Winner {
  id: string;
  alias: string;
  bingoWonAt?: { seconds?: number; _seconds?: number } | null;
}

interface Props {
  slug: string;
  instanceId: string;
  title: string;
  onClose: () => void;
}

function formatWonAt(value: Winner["bingoWonAt"]): string {
  if (!value) return "—";
  const seconds = value.seconds ?? value._seconds ?? 0;
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString("es-PE");
}

export function BingoWinnersPanel({ slug, instanceId, title, onClose }: Props) {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.listMinigameBingoWinners(slug, instanceId);
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setWinners(res.data as Winner[]);
        setError(null);
      } else {
        setError(res.error || "Error al cargar ganadores");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, instanceId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar fondo"
        className="fixed inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ganadores de ${title}`}
        className="relative z-10 max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <p className="text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Ganadores
            </p>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {loading && (
            <p className="py-6 text-center text-sm text-gray-500">
              Cargando ganadores...
            </p>
          )}
          {error && (
            <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
          {!loading && winners.length === 0 && !error && (
            <p className="py-6 text-center text-sm text-gray-500">
              Todavía no hay ganadores.
            </p>
          )}
          {!loading && winners.length > 0 && (
            <ol className="space-y-2">
              {winners.map((w, i) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg" aria-hidden>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎉"}
                    </span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {w.alias}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatWonAt(w.bingoWonAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
