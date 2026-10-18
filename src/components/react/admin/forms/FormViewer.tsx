import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  ArrowIcon,
  CloseIcon,
  CornerNodes,
  ErrorState,
  LoadingState,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { responsesErrorMessage } from "./copy";

const PAGE_SIZE = 10;
const URL_PATTERN = /https?:\/\/[^\s]+/g;

function CellValue({ value }: { value: string }) {
  if (!value) return <span className="text-atlas-fog">—</span>;

  const urls = value.match(URL_PATTERN);
  if (urls) {
    const parts = value.split(URL_PATTERN);
    return (
      <span className="break-words">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {urls[i] && (
              <a
                href={urls[i]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-atlas-dust decoration-atlas-fog hover:decoration-atlas-dust font-semibold underline underline-offset-4"
              >
                {urls[i].includes("drive.google.com")
                  ? "Ver archivo"
                  : "Abrir enlace"}
              </a>
            )}
          </span>
        ))}
      </span>
    );
  }

  return <span className="break-words">{value}</span>;
}

interface RowDetailProps {
  headers: string[];
  row: string[];
  index: number;
  total: number;
  title: string;
  onClose: () => void;
}

function RowDetail({
  headers,
  row,
  index,
  total,
  title,
  onClose,
}: RowDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="bg-atlas-night/80 fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="respuesta-titulo"
        onClick={(e) => e.stopPropagation()}
        className="border-atlas-line bg-atlas-night relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xs border"
      >
        <CornerNodes />
        <div className="border-atlas-line flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="atlas-label text-atlas-glow tabular-nums">
              Respuesta {index + 1} de {total}
            </p>
            <h2
              id="respuesta-titulo"
              className="atlas-name text-atlas-dust mt-1.5 text-[1.375rem] leading-tight break-words"
            >
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-atlas-mist hover:text-atlas-dust hover:bg-atlas-deep -mr-1 shrink-0 rounded-md p-1.5 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
        <dl className="overflow-y-auto px-5">
          {headers.map((h, ci) => (
            <div
              key={ci}
              className="border-atlas-line border-b py-3 last:border-b-0"
            >
              <dt className="atlas-label text-atlas-fog">{h}</dt>
              <dd className="text-atlas-dust mt-1 text-sm">
                <CellValue value={row[ci] || ""} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <a href="/admin/forms" className={`${buttonClass.quiet} -ml-2`}>
      <ArrowIcon className="size-4 rotate-180" />
      Todos los formularios
    </a>
  );
}

export function FormViewer() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const closeDetail = useCallback(() => setSelectedRow(null), []);

  const formId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id") || ""
      : "";

  useEffect(() => {
    if (!formId) {
      setError(
        "No se indicó qué formulario abrir. Vuelve a Formularios y elige uno."
      );
      setCanRetry(false);
      setLoading(false);
      return;
    }
    loadResponses();
  }, [formId]);

  async function loadResponses() {
    setLoading(true);
    setError(null);
    const res = await api.getFormResponses(formId);
    if (res.success && res.data) {
      const data = res.data as { headers: string[]; rows: string[][] };
      setHeaders(data.headers);
      setRows(data.rows);
    } else {
      const known =
        res.error === "Form not found" || res.error === "This form is private";
      setError(responsesErrorMessage(res.error));
      setCanRetry(!known);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const previewCols = useMemo(() => {
    const skip = ["marca temporal", "timestamp", "fecha"];
    return headers
      .map((h, i) => ({ header: h, index: i }))
      .filter((col) => !skip.some((s) => col.header.toLowerCase().includes(s)))
      .slice(0, 4);
  }, [headers]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <LoadingState label="Cargando respuestas…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <BackLink />
        <ErrorState
          message={error}
          onRetry={canRetry ? loadResponses : undefined}
        />
      </div>
    );
  }

  const titleCol = previewCols[0];
  const titleOf = (row: string[], index: number) =>
    (titleCol && row[titleCol.index]?.trim()) || `Respuesta ${index + 1}`;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, filtered.length);
  const toggleBase =
    "px-3 py-1.5 text-sm font-semibold transition-colors first:rounded-l-md last:rounded-r-md";

  return (
    <div className="mx-auto max-w-6xl">
      {selectedRow !== null && filtered[selectedRow] && (
        <RowDetail
          headers={headers}
          row={filtered[selectedRow]}
          index={selectedRow}
          total={filtered.length}
          title={titleOf(filtered[selectedRow], selectedRow)}
          onClose={closeDetail}
        />
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackLink />
          <span className="bg-atlas-line h-4 w-px" aria-hidden="true" />
          <span
            className="text-atlas-mist text-sm tabular-nums"
            aria-live="polite"
          >
            {search.trim()
              ? `${filtered.length} de ${rows.length} ${rows.length === 1 ? "respuesta" : "respuestas"}`
              : `${rows.length} ${rows.length === 1 ? "respuesta" : "respuestas"}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="w-full sm:w-64">
            <span className="sr-only">Buscar en las respuestas</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en las respuestas"
              className={inputClass}
            />
          </label>
          <div
            role="group"
            aria-label="Vista"
            className="border-atlas-line hidden shrink-0 rounded-md border md:flex"
          >
            {(
              [
                { id: "cards", label: "Lista" },
                { id: "table", label: "Tabla" },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={viewMode === mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`${toggleBase} ${
                  viewMode === mode.id
                    ? "bg-atlas-deep text-atlas-dust"
                    : "text-atlas-mist hover:text-atlas-dust"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {paginated.length === 0 ? (
        <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          {search.trim()
            ? `Ninguna respuesta coincide con «${search.trim()}».`
            : "Este formulario todavía no tiene respuestas. Aparecerán aquí en cuanto alguien lo envíe."}
        </p>
      ) : viewMode === "cards" ? (
        <ul className="border-atlas-line @container border-t">
          {paginated.map((row, ri) => {
            const globalIndex = (page - 1) * PAGE_SIZE + ri;
            return (
              <li key={ri} className="border-atlas-line border-b">
                <button
                  type="button"
                  onClick={() => setSelectedRow(globalIndex)}
                  className="group hover:bg-atlas-deep/60 grid w-full grid-cols-[1.75rem_1fr_auto] items-start gap-x-4 px-2 py-4 text-left transition-colors @lg:grid-cols-[2.5rem_1fr_auto]"
                >
                  <span className="text-atlas-fog pt-0.5 text-sm tabular-nums">
                    {globalIndex + 1}
                  </span>
                  <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 @4xl:grid-cols-4">
                    {previewCols.map((col) => (
                      <div key={col.index} className="min-w-0">
                        <dt className="atlas-label text-atlas-fog truncate">
                          {col.header}
                        </dt>
                        <dd className="text-atlas-dust mt-0.5 truncate text-sm">
                          {row[col.index] || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <span className="text-atlas-fog group-hover:text-atlas-dust flex items-center gap-1.5 pt-0.5 text-sm transition-colors">
                    <span className="sr-only @lg:not-sr-only">Ver detalle</span>
                    <ArrowIcon className="size-4" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-atlas-line overflow-x-auto rounded-xs border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="bg-atlas-night border-atlas-line sticky top-0 left-0 z-20 border-b px-3 py-3 text-left"
                >
                  <span className="atlas-label text-atlas-fog">N.º</span>
                </th>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="bg-atlas-night border-atlas-line sticky top-0 z-10 border-b px-3 py-3 text-left whitespace-nowrap"
                  >
                    <span className="atlas-label text-atlas-fog">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((row, ri) => {
                const globalIndex = (page - 1) * PAGE_SIZE + ri;
                return (
                  <tr
                    key={ri}
                    onClick={() => setSelectedRow(globalIndex)}
                    className="group hover:bg-atlas-deep/40 cursor-pointer"
                  >
                    <td className="bg-atlas-night group-hover:bg-atlas-deep border-atlas-line sticky left-0 z-10 border-b px-3 py-2.5 group-last:border-b-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(globalIndex);
                        }}
                        aria-label={`Ver la respuesta ${globalIndex + 1}`}
                        className="text-atlas-mist hover:text-atlas-dust rounded-xs tabular-nums underline-offset-4 hover:underline"
                      >
                        {globalIndex + 1}
                      </button>
                    </td>
                    {headers.map((_, ci) => (
                      <td
                        key={ci}
                        className="text-atlas-dust border-atlas-line max-w-[200px] truncate border-b px-3 py-2.5 group-last:border-b-0"
                      >
                        <CellValue value={row[ci] || ""} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Páginas de respuestas"
          className="mt-6 flex flex-wrap items-center justify-between gap-4"
        >
          <p className="text-atlas-mist text-sm tabular-nums">
            {first}–{last} de {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`${buttonClass.quiet} disabled:opacity-40`}
            >
              <ArrowIcon className="size-4 rotate-180" />
              Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              return start + i;
            })
              .filter((p) => p <= totalPages)
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Página ${p}`}
                  className={`min-w-9 rounded-md px-2.5 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                    p === page
                      ? "bg-atlas-deep text-atlas-dust"
                      : "text-atlas-mist hover:text-atlas-dust"
                  }`}
                >
                  {p}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={`${buttonClass.quiet} disabled:opacity-40`}
            >
              Siguiente
              <ArrowIcon className="size-4" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
