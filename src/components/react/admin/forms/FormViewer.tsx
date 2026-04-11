import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const PAGE_SIZE = 10;
const URL_PATTERN = /https?:\/\/[^\s]+/g;

function CellValue({ value }: { value: string }) {
  if (!value)
    return <span className="text-gray-400 dark:text-gray-500">-</span>;

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
                className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
              >
                {urls[i].includes("drive.google.com") ? "Ver archivo" : "Link"}
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
  onClose: () => void;
}

function RowDetail({ headers, row, index, onClose }: RowDetailProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Respuesta #{index + 1}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
        <div className="divide-y divide-gray-100 px-6 dark:divide-gray-700">
          {headers.map((h, ci) => (
            <div key={ci} className="py-3">
              <p className="mb-1 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {h}
              </p>
              <div className="text-sm text-gray-900 dark:text-gray-200">
                <CellValue value={row[ci] || ""} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormViewer() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");

  const formId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id") || ""
      : "";

  useEffect(() => {
    if (!formId) return;
    loadResponses();
  }, [formId]);

  async function loadResponses() {
    setLoading(true);
    const res = await api.getFormResponses(formId);
    if (res.success && res.data) {
      const data = res.data as { headers: string[]; rows: string[][] };
      setHeaders(data.headers);
      setRows(data.rows);
    } else {
      setError(res.error || "Error al cargar respuestas");
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
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <a
          href="/admin/forms"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          ← Volver a formularios
        </a>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      {selectedRow !== null && (
        <RowDetail
          headers={headers}
          row={filtered[selectedRow]}
          index={selectedRow}
          onClose={() => setSelectedRow(null)}
        />
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/admin/forms"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            ← Formularios
          </a>
          <span className="text-sm text-gray-300 dark:text-gray-600">|</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} respuesta{filtered.length !== 1 && "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-56 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />
          <div className="hidden rounded-lg border border-gray-300 md:flex dark:border-gray-600">
            <button
              onClick={() => setViewMode("cards")}
              className={`rounded-l-lg px-3 py-2 text-xs ${viewMode === "cards" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"}`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-r-lg px-3 py-2 text-xs ${viewMode === "table" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"}`}
            >
              Tabla
            </button>
          </div>
        </div>
      </div>

      {viewMode === "cards" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map((row, ri) => {
            const globalIndex = (page - 1) * PAGE_SIZE + ri;
            return (
              <button
                key={ri}
                onClick={() => setSelectedRow(globalIndex)}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    #{globalIndex + 1}
                  </span>
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    Ver detalle
                  </span>
                </div>
                {previewCols.map((col) => (
                  <div key={col.index} className="mb-1.5">
                    <p className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500">
                      {col.header}
                    </p>
                    <p className="truncate text-sm text-gray-900 dark:text-gray-200">
                      {row[col.index] || "-"}
                    </p>
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      )}

      {viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-gray-50 px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:bg-gray-900 dark:text-gray-400">
                  #
                </th>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="sticky top-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-medium tracking-wider whitespace-nowrap text-gray-500 uppercase dark:bg-gray-900 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginated.map((row, ri) => {
                const globalIndex = (page - 1) * PAGE_SIZE + ri;
                return (
                  <tr
                    key={ri}
                    onClick={() => setSelectedRow(globalIndex)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-3 text-xs text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                      {globalIndex + 1}
                    </td>
                    {headers.map((_, ci) => (
                      <td
                        key={ci}
                        className="max-w-[200px] truncate px-3 py-3 text-sm text-gray-700 dark:text-gray-300"
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

      {paginated.length === 0 && (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">
          {search ? "Sin resultados" : "No hay respuestas."}
        </p>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {(page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"
            >
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
                  onClick={() => setPage(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    p === page
                      ? "bg-blue-600 text-white"
                      : "border border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
