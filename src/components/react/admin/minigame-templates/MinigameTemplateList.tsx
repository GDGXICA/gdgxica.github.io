import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  emptyForType,
  type MinigameType,
  type Template,
} from "./types";
import { MinigameTemplateForm } from "./MinigameTemplateForm";

const PAGE_SIZE = 10;

function formatUpdatedAt(value: Template["updatedAt"]): string {
  if (!value) return "—";
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const seconds = value.seconds ?? 0;
    return new Date(seconds * 1000).toLocaleString("es-PE");
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("es-PE");
  }
  return "—";
}

export function MinigameTemplateList() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [editing, setEditing] = useState<Template | null>(null);
  const [creatingFor, setCreatingFor] = useState<MinigameType | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (!pickerOpen) return;
    function handler(ev: MouseEvent) {
      if (
        pickerRef.current &&
        ev.target instanceof Node &&
        !pickerRef.current.contains(ev.target)
      ) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        TYPE_LABELS[t.type].toLowerCase().includes(q)
    );
  }, [templates, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function loadTemplates() {
    setLoading(true);
    const res = await api.listMinigameTemplates();
    if (res.success && Array.isArray(res.data)) {
      setTemplates(res.data as Template[]);
      setError(null);
    } else {
      setError(res.error || "Error al cargar plantillas");
    }
    setLoading(false);
  }

  async function handleSubmit(template: Template) {
    setSaving(true);
    const isNew = !editing;
    // Strip server-managed fields before sending.
    const {
      id: _id,
      version: _version,
      updatedAt: _updatedAt,
      ...payload
    } = template as Template & {
      id?: string;
      version?: number;
      updatedAt?: unknown;
    };
    void _id;
    void _version;
    void _updatedAt;

    const res = isNew
      ? await api.addMinigameTemplate(payload)
      : await api.updateMinigameTemplate(template.id!, payload);

    if (res.success) {
      setToast({
        message: `Plantilla ${isNew ? "creada" : "actualizada"}`,
        type: "success",
      });
      setEditing(null);
      setCreatingFor(null);
      loadTemplates();
    } else {
      setToast({ message: res.error || "Error al guardar", type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Eliminar plantilla "${title}"?`)) return;
    setDeleting(id);
    const res = await api.deleteMinigameTemplate(id);
    if (res.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setToast({ message: "Plantilla eliminada", type: "success" });
    } else {
      setToast({ message: res.error || "Error al eliminar", type: "error" });
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (editing || creatingFor) {
    const initial: Template = editing ?? emptyForType(creatingFor!);
    return (
      <MinigameTemplateForm
        initial={initial}
        isEdit={Boolean(editing)}
        saving={saving}
        onCancel={() => {
          setEditing(null);
          setCreatingFor(null);
        }}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o tipo..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-64 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />
          <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} plantilla{filtered.length !== 1 && "s"}
          </span>
        </div>
        <div ref={pickerRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nueva plantilla ▾
          </button>
          {pickerOpen && (
            <div className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {(Object.keys(TYPE_LABELS) as MinigameType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setCreatingFor(t);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <span>{TYPE_LABELS[t]}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${TYPE_COLORS[t]}`}
                  >
                    {t}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Título
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Última actualización
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginated.map((t) => (
              <tr
                key={t.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <td className="px-6 py-4">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.type]}`}
                  >
                    {TYPE_LABELS[t.type]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                      {t.description}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {formatUpdatedAt(t.updatedAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(t)}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(t.id!, t.title)}
                      disabled={deleting === t.id}
                      className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      {deleting === t.id ? "..." : "Eliminar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {paginated.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-medium text-gray-900 dark:text-white">
                {t.title}
              </p>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.type]}`}
              >
                {TYPE_LABELS[t.type]}
              </span>
            </div>
            {t.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t.description}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Actualizado {formatUpdatedAt(t.updatedAt)}
            </p>
            <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              <button
                onClick={() => setEditing(t)}
                className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(t.id!, t.title)}
                disabled={deleting === t.id}
                className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {deleting === t.id ? "..." : "Eliminar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {paginated.length === 0 && (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          {search
            ? "Sin resultados"
            : "Aún no hay plantillas. Crea la primera con el botón de arriba."}
        </p>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {(page - 1) * PAGE_SIZE + 1}-
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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
