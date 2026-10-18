import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { ErrorState, LoadingState, buttonClass } from "../ui/atlas";
import { describeAction, describeChange } from "./describe";

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
const SEVERITY_DOT: Record<string, { size: number; color: string }> = {
  critical: { size: 14, color: "bg-atlas-star" },
  warning: { size: 11, color: "bg-atlas-glow" },
  notice: { size: 8, color: "bg-atlas-dust" },
  info: { size: 6, color: "bg-atlas-fog" },
};

const OUTCOME_LABEL: Record<string, string> = {
  success: "OK",
  denied: "Denegado",
  failure: "Fallo",
};

const OUTCOME_STYLE: Record<string, string> = {
  success: "text-atlas-ok border-atlas-ok/40",
  denied: "text-atlas-glow border-atlas-glow/40",
  failure: "text-atlas-rose border-atlas-rose/40",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítico",
  warning: "Advertencia",
  notice: "Notable",
  info: "Informativo",
};

function toDate(ts: AuditEntry["timestamp"]): Date | null {
  return ts?._seconds ? new Date(ts._seconds * 1000) : null;
}

function dayLabel(date: Date | null): string {
  if (!date) return "Sin fecha";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function groupByDay(entries: AuditEntry[]) {
  const groups: { label: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(toDate(entry.timestamp));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
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
        setError(res.error || "No se pudo cargar la auditoría");
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

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-atlas-mist mb-6 max-w-[70ch] text-sm leading-relaxed">
        Registro de todas las operaciones de escritura, los intentos denegados y
        las lecturas de datos sensibles. Es de solo lectura: nadie, ni un
        administrador, puede editarlo ni borrarlo desde el panel.
      </p>

      <div className="border-atlas-line mb-8 flex flex-wrap items-center gap-x-6 gap-y-4 border-b pb-6">
        <div
          role="group"
          aria-label="Vistas rápidas"
          className="border-atlas-line flex flex-wrap rounded-md border p-1"
        >
          {PRESETS.map((preset) => {
            const active =
              JSON.stringify(preset.params) === JSON.stringify(applied);
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => applyPreset(preset.params)}
                className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-atlas-deep text-atlas-dust"
                    : "text-atlas-mist hover:text-atlas-dust"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={applyFilter}
          className="flex min-w-[min(100%,28rem)] flex-1 flex-wrap gap-2"
        >
          <label className="sr-only" htmlFor="audit-filter-key">
            Campo del filtro
          </label>
          <select
            id="audit-filter-key"
            value={filterKey}
            onChange={(e) => setFilterKey(e.target.value as FilterKey)}
            className="border-atlas-line bg-atlas-night text-atlas-dust rounded-md border px-3 py-2 text-sm"
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="audit-filter-value">
            Valor del filtro
          </label>
          <input
            id="audit-filter-value"
            type="text"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={FILTERS.find((f) => f.key === filterKey)?.placeholder}
            className="border-atlas-line bg-atlas-night text-atlas-dust min-w-40 flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button type="submit" className={buttonClass.secondary}>
            Filtrar
          </button>
          {Object.keys(applied).length > 0 && (
            <button
              type="button"
              onClick={clearFilter}
              className={buttonClass.quiet}
            >
              Limpiar
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorState
            message="No se pudo cargar la auditoría."
            onRetry={() => load(applied, false)}
          />
        </div>
      )}

      {loading ? (
        <LoadingState label="Cargando la auditoría…" />
      ) : entries.length === 0 ? (
        !error && (
          <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-6 text-sm">
            No hay entradas para este filtro.
          </p>
        )
      ) : (
        <div className="space-y-8">
          {groupByDay(entries).map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="atlas-label text-atlas-glow mb-2 flex items-center gap-3">
                <span className="first-letter:uppercase">{group.label}</span>
                <span
                  className="bg-atlas-line h-px flex-1"
                  aria-hidden="true"
                />
              </h3>
              <ol>
                {group.entries.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {cursor && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => load({ ...applied, cursor }, true)}
            disabled={loadingMore}
            className={buttonClass.secondary}
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const date = toDate(entry.timestamp);
  const severity = entry.severity ?? "info";
  const outcome = entry.outcome ?? "success";
  const dot = SEVERITY_DOT[severity] ?? SEVERITY_DOT.info;
  const described = describeAction(entry.action);
  const change = describeChange(entry.details);
  const reason = entry.details?.reason;
  const actor = entry.actor?.email || entry.performedBy;
  const rest = Object.fromEntries(
    Object.entries(entry.details ?? {}).filter(([k]) => k !== "reason")
  );

  return (
    <li className="border-atlas-line grid grid-cols-[3.25rem_1fr] gap-x-4 border-b py-4 last:border-b-0">
      <time
        dateTime={date?.toISOString()}
        className="text-atlas-fog pt-0.5 text-sm tabular-nums"
      >
        {date
          ? date.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })
          : "—"}
      </time>
      <div className="min-w-0">
        <p className="text-atlas-dust flex flex-wrap items-baseline gap-x-1.5 leading-relaxed">
          <span
            className="grid size-4 shrink-0 translate-y-0.5 place-items-center self-start"
            title={SEVERITY_LABEL[severity]}
          >
            <span
              className={`rounded-full ${dot.color}`}
              style={{ width: dot.size, height: dot.size }}
            />
            <span className="sr-only">{SEVERITY_LABEL[severity]}:</span>
          </span>
          {described.kind === "security" ? (
            <>
              <span className="text-atlas-glow font-semibold">
                {described.text}
              </span>
              <span className="text-atlas-mist">·</span>
              <span className="font-semibold break-all">{actor}</span>
            </>
          ) : (
            <>
              <span className="font-semibold break-all">{actor}</span>
              {described.kind === "sentence" ? (
                <span className="text-atlas-mist">{described.text}</span>
              ) : (
                <code className="text-atlas-mist text-sm">
                  {described.text}
                </code>
              )}
              {entry.targetId && (
                <span className="font-semibold break-all">
                  {entry.targetId}
                </span>
              )}
              {change && <span className="text-atlas-mist">{change}</span>}
            </>
          )}
        </p>
        {typeof reason === "string" && (
          <p className="text-atlas-mist mt-1 pl-[1.375rem] text-sm">
            «{reason}»
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[1.375rem] text-xs">
          {outcome !== "success" && (
            <span
              className={`rounded-xs border px-1.5 py-0.5 font-semibold ${
                OUTCOME_STYLE[outcome] ?? ""
              }`}
            >
              {OUTCOME_LABEL[outcome] ?? outcome}
            </span>
          )}
          {/* Una fila sintética significa que hay código mutando sin
              decir qué. Se marca para que incomode, no para que pase. */}
          {entry.synthesized && (
            <span
              className="text-atlas-glow border-atlas-glow/40 rounded-xs border px-1.5 py-0.5 font-semibold"
              title="Ningún handler declaró esta operación: la registró la red de seguridad."
            >
              Sin declarar
            </span>
          )}
          {entry.actor?.role && (
            <span className="text-atlas-fog">
              {ROLE_LABELS[entry.actor.role as Role] ?? entry.actor.role}
            </span>
          )}
          <details className="group text-atlas-fog">
            <summary className="hover:text-atlas-dust cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Detalle técnico</span>
              <span className="hidden group-open:inline">Ocultar detalle</span>
            </summary>
            <dl className="border-atlas-line bg-atlas-deep/40 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xs border p-3">
              <dt>Acción</dt>
              <dd>
                <code className="text-atlas-mist">{entry.action}</code>
              </dd>
              {entry.category && (
                <>
                  <dt>Categoría</dt>
                  <dd className="text-atlas-mist">{entry.category}</dd>
                </>
              )}
              {entry.targetType && (
                <>
                  <dt>Tipo</dt>
                  <dd className="text-atlas-mist">{entry.targetType}</dd>
                </>
              )}
              {entry.performedBy !== actor && (
                <>
                  <dt>Autor (uid)</dt>
                  <dd>
                    <code className="text-atlas-mist break-all">
                      {entry.performedBy}
                    </code>
                  </dd>
                </>
              )}
              <dt>Red</dt>
              <dd className="text-atlas-mist">
                {entry.context?.ipPrefix || "—"}
              </dd>
              {entry.context?.route && (
                <>
                  <dt>Ruta</dt>
                  <dd>
                    <code className="text-atlas-mist break-all">
                      {entry.context.method} {entry.context.route}
                    </code>
                  </dd>
                </>
              )}
              {entry.context?.requestId && (
                <>
                  <dt title="Id de correlación: sirve para cruzar esta fila con Cloud Logging.">
                    Solicitud
                  </dt>
                  <dd>
                    <code className="text-atlas-mist break-all">
                      {entry.context.requestId}
                    </code>
                  </dd>
                </>
              )}
              {Object.keys(rest).length > 0 && (
                <>
                  <dt>Datos</dt>
                  <dd>
                    <pre className="text-atlas-mist overflow-x-auto font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(rest, null, 2)}
                    </pre>
                  </dd>
                </>
              )}
            </dl>
          </details>
        </div>
      </div>
    </li>
  );
}
