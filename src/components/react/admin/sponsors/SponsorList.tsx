import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";

interface Sponsor {
  name: string;
  logo_url: string;
  url: string;
  sector: string;
  description: string;
  featured: boolean;
}

const EMPTY_SPONSOR: Sponsor = {
  name: "",
  logo_url: "",
  url: "",
  sector: "",
  description: "",
  featured: false,
};

export function SponsorList() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const form = editing || (creating ? EMPTY_SPONSOR : null);

  useEffect(() => {
    loadSponsors();
  }, []);

  async function loadSponsors() {
    setLoading(true);
    const res = await api.listSponsors();
    if (res.success && res.data) {
      setSponsors(res.data as Sponsor[]);
    } else {
      setError(res.error || "Error al cargar sponsors");
    }
    setLoading(false);
  }

  function updateForm(field: keyof Sponsor, value: unknown) {
    if (editing) setEditing({ ...editing, [field]: value });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const isNew = creating;
    const res = isNew
      ? await api.addSponsor(form)
      : await api.updateSponsor(form.name, form);

    if (res.success) {
      setToast({
        message: `Sponsor ${isNew ? "agregado" : "actualizado"}`,
        type: "success",
      });
      setEditing(null);
      setCreating(false);
      loadSponsors();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete(name: string) {
    if (!confirm(`Eliminar sponsor "${name}"?`)) return;
    setDeleting(name);
    const res = await api.deleteSponsor(name);
    if (res.success) {
      setSponsors((prev) => prev.filter((s) => s.name !== name));
      setToast({ message: "Sponsor eliminado", type: "success" });
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

  if (form) {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => {
            setEditing(null);
            setCreating(false);
          }}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Volver a sponsors
        </button>
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
          {creating ? "Agregar sponsor" : `Editar: ${form.name}`}
        </h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nombre" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  className={inputClass}
                  disabled={!!editing}
                />
              </FormField>
              <FormField label="Sector">
                <input
                  type="text"
                  value={form.sector}
                  onChange={(e) => updateForm("sector", e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Descripcion">
                  <textarea
                    value={form.description}
                    onChange={(e) => updateForm("description", e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                </FormField>
              </div>
              <FormField label="URL logo">
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={(e) => updateForm("logo_url", e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Website">
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => updateForm("url", e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => updateForm("featured", e.target.checked)}
                  className="rounded"
                />
                Destacado
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : creating ? "Agregar" : "Actualizar"}
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
          {sponsors.length} sponsors
        </p>
        <button
          onClick={() => {
            setCreating(true);
            setEditing({ ...EMPTY_SPONSOR });
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Agregar sponsor
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Sponsor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Sector
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sponsors.map((sponsor) => (
              <tr
                key={sponsor.name}
                className="hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {sponsor.name}
                  </p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {sponsor.sector}
                </td>
                <td className="px-6 py-4">
                  {sponsor.featured && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                      Destacado
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(sponsor)}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(sponsor.name)}
                      disabled={deleting === sponsor.name}
                      className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      {deleting === sponsor.name ? "..." : "Eliminar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
