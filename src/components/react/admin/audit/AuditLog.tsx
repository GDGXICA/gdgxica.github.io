import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface AuditEntry {
  id: string;
  action: string;
  performedBy: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>;
  timestamp?: { _seconds: number };
}

interface AuditPage {
  entries: AuditEntry[];
  nextCursor: string | null;
}

/** Solo se admite un filtro a la vez: cada uno tiene su índice compuesto. */
const FILTERS = [
  { key: "action", label: "Acción", placeholder: "user.role.change" },
  { key: "performedBy", label: "Autor (uid)", placeholder: "uid del actor" },
  { key: "targetId", label: "Objetivo", placeholder: "uid o id del recurso" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** Acciones que tocan el control de acceso: se resaltan al revisar. */
const ACCESS_ACTIONS = new Set([
  "user.role.change",
  "user.status.change",
  "user.grants.change",
]);

function formatDate(ts: AuditEntry["timestamp"]): string {
  if (!ts?._seconds) return "—";
  return new Date(ts._seconds * 1000).toLocaleString("es-PE");
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>("action");
  const [filterValue, setFilterValue] = useState("");
  const [applied, setApplied] = useState<Record<string, string>>({});

  const load = useCallback(
    async (params: Record<string, string>, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const res = await api.listAudit(params);
      if (res.success && res.data) {
        const page = res.data as AuditPage;
        setEntries((prev) =>
          append ? [...prev, ...page.entries] : page.entries
        );
        setCursor(page.nextCursor);
      } else {
        setError(res.error || "Error al cargar la auditoría");
      }

      setLoading(false);
      setLoadingMore(false);
    },
    []
  );

  useEffect(() => {
    load({}, false);
  }, [load]);

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    const next = filterValue.trim() ? { [filterKey]: filterValue.trim() } : {};
    setApplied(next);
    load(next, false);
  }

  function clearFilter() {
    setFilterValue("");
    setApplied({});
    load({}, false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Registro de todas las operaciones de escritura. Es de solo lectura:
        nadie, ni un administrador, puede editarlo ni borrarlo desde el panel.
      </p>

      <form onSubmit={applyFilter} className="mb-6 flex flex-wrap gap-2">
        <select
          value={filterKey}
          onChange={(e) => setFilterKey(e.target.value as FilterKey)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          placeholder={FILTERS.find((f) => f.key === filterKey)?.placeholder}
          className="min-w-56 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filtrar
        </button>
        {Object.keys(applied).length > 0 && (
          <button
            type="button"
            onClick={clearFilter}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Limpiar
          </button>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No hay entradas para este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {["Fecha", "Acción", "Autor", "Objetivo", "Detalle"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((entry) => {
                const reason = entry.details?.reason;
                return (
                  <tr
                    key={entry.id}
                    className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-xs font-medium ${
                          ACCESS_ACTIONS.has(entry.action)
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {entry.performedBy}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {entry.targetId || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {typeof reason === "string" && (
                        <p className="mb-1 text-gray-900 dark:text-gray-200">
                          {reason}
                        </p>
                      )}
                      <code className="text-xs break-all text-gray-500 dark:text-gray-500">
                        {JSON.stringify(
                          Object.fromEntries(
                            Object.entries(entry.details ?? {}).filter(
                              ([k]) => k !== "reason"
                            )
                          )
                        )}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => load({ ...applied, cursor }, true)}
            disabled={loadingMore}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {loadingMore ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}
    </div>
  );
}
