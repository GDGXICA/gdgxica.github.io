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
  outcome?: "success" | "denied" | "failure";
  severity?: "info" | "notice" | "warning" | "critical";
  category?: string;
  actor?: { email?: string | null; role?: string | null; scope?: string };
  context?: {
    requestId?: string;
    route?: string;
    ipPrefix?: string | null;
    method?: string;
  };
  /** La escribió la red de seguridad porque ningún handler dijo qué pasó. */
  synthesized?: boolean;
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
  { key: "category", label: "Categoría", placeholder: "security, access…" },
  { key: "severity", label: "Severidad", placeholder: "notable, critical…" },
  { key: "outcome", label: "Resultado", placeholder: "denied, failure…" },
  {
    key: "context.ipPrefix",
    label: "Red (prefijo)",
    placeholder: "181.65.42.0/24",
  },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const FILTER_KEYS = FILTERS.map((f) => f.key) as readonly string[];

/**
 * Atajos: las dos preguntas que de verdad se hacen al abrir esta pantalla, sin
 * tener que recordar qué valor va en qué campo.
 */
const PRESETS = [
  { label: "Todo", params: {} as Record<string, string> },
  { label: "Seguridad", params: { category: "security" } },
  { label: "Notable", params: { severity: "notable" } },
  { label: "Accesos", params: { category: "access" } },
  { label: "Denegado", params: { outcome: "denied" } },
];

/**
 * Color por severidad, no por una lista de acciones a mano.
 *
 * Antes era un `Set` con tres nombres de acción escritos a mano. Esa lista se
 * desincroniza en cuanto se añade una acción —y se añadieron muchas—, así que
 * el resaltado dejaba de marcar justo lo nuevo. Derivarlo del campo hace que
 * cualquier acción futura entre con el color que le toca sin tocar nada aquí.
 */
const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  notice: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  info: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const OUTCOME_LABEL: Record<string, string> = {
  success: "OK",
  denied: "Denegado",
  failure: "Fallo",
};

const OUTCOME_STYLE: Record<string, string> = {
  success: "text-green-700 dark:text-green-400",
  denied: "text-amber-700 dark:text-amber-400",
  failure: "text-red-700 dark:text-red-400",
};

function formatDate(ts: AuditEntry["timestamp"]): string {
  if (!ts?._seconds) return "—";
  return new Date(ts._seconds * 1000).toLocaleString("es-PE");
}

/** Lee el filtro de la URL, para que un hallazgo se pueda enlazar. */
function paramsFromUrl(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const search = new URLSearchParams(window.location.search);
  for (const key of FILTER_KEYS) {
    const value = search.get(key);
    if (value) return { [key]: value };
  }
  return {};
}

function syncUrl(params: Record<string, string>) {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(window.location.search);
  for (const key of FILTER_KEYS) search.delete(key);
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  const query = search.toString();
  window.history.replaceState(
    null,
    "",
    query ? `${window.location.pathname}?${query}` : window.location.pathname
  );
}

const COLUMNS = [
  "Fecha",
  "Acción",
  "Resultado",
  "Autor",
  "Objetivo",
  "Red",
  "Detalle",
];

export function AuditLog() {
  // Se lee UNA vez al montar, no en cada render: es el estado inicial que trae
  // la URL, y recalcularlo continuamente además dejaría el efecto de abajo con
  // una dependencia que cambia de identidad en cada pasada.
  const [initial] = useState(paramsFromUrl);
  const initialKey = (Object.keys(initial)[0] ?? "action") as FilterKey;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>(initialKey);
  const [filterValue, setFilterValue] = useState(initial[initialKey] ?? "");
  const [applied, setApplied] = useState<Record<string, string>>(initial);

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
    load(initial, false);
  }, [load, initial]);

  function apply(params: Record<string, string>) {
    setApplied(params);
    syncUrl(params);
    load(params, false);
  }

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    apply(filterValue.trim() ? { [filterKey]: filterValue.trim() } : {});
  }

  function applyPreset(params: Record<string, string>) {
    const key = (Object.keys(params)[0] ?? "action") as FilterKey;
    setFilterKey(key);
    setFilterValue(params[key] ?? "");
    apply(params);
  }

  function clearFilter() {
    setFilterValue("");
    apply({});
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
        Registro de todas las operaciones de escritura, los intentos denegados y
        las lecturas de datos sensibles. Es de solo lectura: nadie, ni un
        administrador, puede editarlo ni borrarlo desde el panel.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const active =
            JSON.stringify(preset.params) === JSON.stringify(applied);
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.params)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                active
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

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
                {COLUMNS.map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((entry) => {
                const reason = entry.details?.reason;
                const severity = entry.severity ?? "info";
                const outcome = entry.outcome ?? "success";
                return (
                  <tr
                    key={entry.id}
                    className={`align-top hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      // Una fila sintética significa que hay código mutando sin
                      // decir qué. Se marca para que incomode, no para que pase.
                      entry.synthesized
                        ? "border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-900/10"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-xs font-medium ${
                          SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info
                        }`}
                      >
                        {entry.action}
                      </span>
                      {entry.synthesized && (
                        <span
                          className="ml-2 text-xs text-amber-700 dark:text-amber-400"
                          title="Ningún handler declaró esta operación: la registró la red de seguridad."
                        >
                          sin declarar
                        </span>
                      )}
                      {entry.category && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          {entry.category}
                        </p>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${
                        OUTCOME_STYLE[outcome] ?? ""
                      }`}
                    >
                      {OUTCOME_LABEL[outcome] ?? outcome}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {entry.performedBy}
                      {entry.actor?.role && (
                        <p className="mt-1 font-sans text-gray-400 dark:text-gray-500">
                          {entry.actor.role}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {entry.targetId || "—"}
                      {entry.targetType && (
                        <p className="mt-1 font-sans text-gray-400 dark:text-gray-500">
                          {entry.targetType}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-gray-500 dark:text-gray-500">
                      {entry.context?.ipPrefix || "—"}
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
                      {entry.context?.requestId && (
                        <p
                          className="mt-1 font-mono text-xs text-gray-400 dark:text-gray-600"
                          title="Id de correlación: sirve para cruzar esta fila con Cloud Logging."
                        >
                          {entry.context.requestId}
                        </p>
                      )}
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
