import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const PAGE_SIZE = 20;
const URL_PATTERN = /https?:\/\/[^\s]+/g;

function CellValue({ value }: { value: string }) {
  if (!value)
    return <span className="text-gray-400 dark:text-gray-500">-</span>;

  const urls = value.match(URL_PATTERN);
  if (urls) {
    const parts = value.split(URL_PATTERN);
    return (
      <span>
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {urls[i] && (
              <a
                href={urls[i]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {urls[i].includes("drive.google.com")
                  ? "Ver archivo"
                  : urls[i].length > 50
                    ? urls[i].slice(0, 50) + "..."
                    : urls[i]}
              </a>
            )}
          </span>
        ))}
      </span>
    );
  }

  return <span>{value}</span>;
}

export function FormViewer() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en respuestas..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-64 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="max-w-xs px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginated.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                  {(page - 1) * PAGE_SIZE + ri + 1}
                </td>
                {headers.map((_, ci) => (
                  <td
                    key={ci}
                    className="max-w-xs truncate px-4 py-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <CellValue value={row[ci] || ""} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {paginated.map((row, ri) => (
          <div
            key={ri}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
              #{(page - 1) * PAGE_SIZE + ri + 1}
            </p>
            {headers.map((h, ci) => (
              <div key={ci} className="mb-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {h}
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-200">
                  <CellValue value={row[ci] || ""} />
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>

      {paginated.length === 0 && (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">
          {search ? "Sin resultados" : "No hay respuestas."}
        </p>
      )}

      {/* Pagination */}
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
