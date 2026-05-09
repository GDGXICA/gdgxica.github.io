import { useState } from "react";
import { api } from "@/lib/api";
import { useRouletteParticipants } from "@/components/react/event/useRouletteParticipants";

interface Props {
  slug: string;
  instanceId: string;
  title: string;
  onClose: () => void;
}

export function RoulettePanel({ slug, instanceId, title, onClose }: Props) {
  const { eligible, winners, loading, error } = useRouletteParticipants(
    slug,
    instanceId
  );
  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [lastWinner, setLastWinner] = useState<{
    alias: string;
    spinNumber: number;
  } | null>(null);

  async function handleSpin() {
    setSpinning(true);
    setSpinError(null);
    setLastWinner(null);
    const res = await api.spinRoulette(slug, instanceId);
    if (res.success && res.data) {
      setLastWinner({ alias: res.data.alias, spinNumber: res.data.spinNumber });
    } else {
      setSpinError(res.error ?? "Error al girar la ruleta");
    }
    setSpinning(false);
  }

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
        aria-label={`Ruleta: ${title}`}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <p className="text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Ruleta
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

        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-6">
          {/* Stats bar */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">
                {loading ? "…" : eligible.length}
              </span>{" "}
              elegibles
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">
                {loading ? "…" : winners.length}
              </span>{" "}
              ganadores
            </span>
          </div>

          {/* Spin button */}
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning || loading || eligible.length === 0}
            className="w-full rounded-xl bg-rose-600 py-3 text-base font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {spinning ? "Girando…" : "🎰 Girar ruleta"}
          </button>

          {/* Last winner banner */}
          {lastWinner && (
            <div className="rounded-xl border border-green-300 bg-green-50 px-5 py-4 text-center dark:border-green-700 dark:bg-green-900/20">
              <p className="text-2xl" aria-hidden>
                🎉
              </p>
              <p className="mt-1 font-bold text-green-800 dark:text-green-300">
                ¡{lastWinner.alias} ganó el giro #{lastWinner.spinNumber}!
              </p>
            </div>
          )}

          {spinError && (
            <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {spinError}
            </p>
          )}

          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Winners leaderboard */}
          {winners.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Ganadores
              </p>
              <ol className="space-y-2">
                {winners.map((w, i) => (
                  <li
                    key={w.uid}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                  >
                    <span className="text-lg" aria-hidden>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎉"}
                    </span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {w.alias}
                    </p>
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                      Giro #{w.rouletteSpinNumber}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Eligible participants list */}
          {eligible.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold tracking-wider text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                Elegibles ({eligible.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {eligible.map((p) => (
                  <li
                    key={p.uid}
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    {p.alias}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!loading && eligible.length === 0 && winners.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Aún no hay participantes en la ruleta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
