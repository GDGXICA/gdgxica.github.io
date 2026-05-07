import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface WordRow {
  id: string;
  text: string;
  normalized: string;
  count: number;
  hidden?: boolean;
}

interface Props {
  slug: string;
  instanceId: string;
  title: string;
  onClose: () => void;
}

export function WordModerationPanel({
  slug,
  instanceId,
  title,
  onClose,
}: Props) {
  const [words, setWords] = useState<WordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.listEventMinigameWords(slug, instanceId);
    if (res.success && Array.isArray(res.data)) {
      setWords(res.data as WordRow[]);
      setError(null);
    } else {
      setError(res.error || "Error al cargar palabras");
    }
    setLoading(false);
  }, [slug, instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleHidden(word: WordRow) {
    setBusyId(word.id);
    const res = await api.setMinigameWordHidden(
      slug,
      instanceId,
      word.id,
      !word.hidden
    );
    if (res.success) {
      setWords((prev) =>
        prev.map((w) => (w.id === word.id ? { ...w, hidden: !w.hidden } : w))
      );
    } else {
      setError(res.error || "Error al actualizar palabra");
    }
    setBusyId(null);
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
        aria-label={`Moderación de ${title}`}
        className="relative z-10 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <p className="text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Moderación
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
              Cargando palabras...
            </p>
          )}
          {error && (
            <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
          {!loading && words.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">
              Aún no hay palabras enviadas.
            </p>
          )}
          {!loading && words.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Palabra
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Cuenta
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {words.map((w) => (
                  <tr
                    key={w.id}
                    className={
                      w.hidden
                        ? "opacity-60"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700"
                    }
                  >
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                      {w.text}
                      {w.hidden && (
                        <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          oculto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-gray-700 dark:text-gray-300">
                      {w.count}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleHidden(w)}
                        disabled={busyId === w.id}
                        className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      >
                        {busyId === w.id
                          ? "..."
                          : w.hidden
                            ? "Mostrar"
                            : "Ocultar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
