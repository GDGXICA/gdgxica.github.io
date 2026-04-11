import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";

interface FormEntry {
  id: string;
  name: string;
  spreadsheet_id: string;
  sheet_name: string;
  is_public: boolean;
  created_at: string;
}

const EMPTY_FORM: FormEntry = {
  id: "",
  name: "",
  spreadsheet_id: "",
  sheet_name: "Form Responses 1",
  is_public: true,
  created_at: "",
};

export function FormRegistry() {
  const { isAdmin } = useAuth();
  const [forms, setForms] = useState<FormEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormEntry>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadForms();
  }, []);

  async function loadForms() {
    setLoading(true);
    const res = await api.listForms();
    if (res.success && res.data) {
      setForms(res.data as FormEntry[]);
    } else {
      setError(res.error || "Error al cargar formularios");
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id || !form.name || !form.spreadsheet_id) {
      setToast({
        message: "ID, nombre y spreadsheet ID son obligatorios",
        type: "error",
      });
      return;
    }
    setSaving(true);
    const res = await api.addForm(form);
    if (res.success) {
      setToast({ message: "Formulario registrado", type: "success" });
      setCreating(false);
      setForm(EMPTY_FORM);
      loadForms();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(`Eliminar formulario "${id}"?`)) return;
    setDeleting(id);
    const res = await api.deleteForm(id);
    if (res.success) {
      setForms((prev) => prev.filter((f) => f.id !== id));
      setToast({ message: "Formulario eliminado", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
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

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400";

  if (creating) {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => setCreating(false)}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Volver a formularios
        </button>
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
          Registrar formulario
        </h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="ID (slug)" required>
                <input
                  type="text"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="speakers-bwai-2026"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Nombre" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Convocatoria Speakers"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Spreadsheet ID" required>
                <input
                  type="text"
                  value={form.spreadsheet_id}
                  onChange={(e) =>
                    setForm({ ...form, spreadsheet_id: e.target.value })
                  }
                  placeholder="1BxiMVs0XRA5nFMd..."
                  className={inputClass}
                />
              </FormField>
              <FormField label="Nombre de la hoja">
                <input
                  type="text"
                  value={form.sheet_name}
                  onChange={(e) =>
                    setForm({ ...form, sheet_name: e.target.value })
                  }
                  className={inputClass}
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(e) =>
                    setForm({ ...form, is_public: e.target.checked })
                  }
                  className="rounded"
                />
                Publico (visible para organizers)
              </label>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Recuerda compartir el Google Sheet con{" "}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
              647264238138-compute@developer.gserviceaccount.com
            </code>{" "}
            como Lector.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </form>
      </div>
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

      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {forms.length} formulario{forms.length !== 1 && "s"}
        </p>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Agregar formulario
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f) => (
          <div
            key={f.id}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {f.name}
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {f.id}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  f.is_public
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                }`}
              >
                {f.is_public ? "Publico" : "Privado"}
              </span>
            </div>
            <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
              {new Date(f.created_at).toLocaleDateString("es-PE")}
            </p>
            <div className="flex gap-2">
              {f.is_public && (
                <a
                  href={`/admin/forms/viewer?id=${f.id}`}
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                >
                  Ver respuestas
                </a>
              )}
              {isAdmin && (
                <button
                  onClick={() => handleDelete(f.id)}
                  disabled={deleting === f.id}
                  className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  {deleting === f.id ? "..." : "Eliminar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {forms.length === 0 && (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">
          No hay formularios registrados.
        </p>
      )}
    </div>
  );
}
