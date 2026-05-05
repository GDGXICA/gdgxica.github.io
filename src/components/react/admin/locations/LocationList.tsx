import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";

interface Location {
  id: string;
  name: string;
  address: string;
  map_url: string;
  map_embed: string;
}

type LocationForm = Omit<Location, "id"> & { id?: string };

const EMPTY_LOCATION: LocationForm = {
  name: "",
  address: "",
  map_url: "",
  map_embed: "",
};

const PAGE_SIZE = 10;

export function LocationList() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [editing, setEditing] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const form: LocationForm | null =
    editing || (creating ? { ...EMPTY_LOCATION } : null);

  useEffect(() => {
    loadLocations();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return locations;
    const q = search.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)
    );
  }, [locations, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function loadLocations() {
    setLoading(true);
    const res = await api.listLocations();
    if (res.success && res.data) {
      setLocations(res.data as Location[]);
    } else {
      setError(res.error || "Error al cargar ubicaciones");
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const isNew = creating;
    const payload = {
      name: form.name,
      address: form.address,
      map_url: form.map_url,
      map_embed: form.map_embed,
    };
    const res = isNew
      ? await api.addLocation(payload)
      : await api.updateLocation((form as Location).id, payload);

    if (res.success) {
      setToast({
        message: `Ubicación ${isNew ? "agregada" : "actualizada"}`,
        type: "success",
      });
      setEditing(null);
      setCreating(false);
      loadLocations();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Eliminar ubicación "${name}"?`)) return;
    setDeleting(id);
    const res = await api.deleteLocation(id);
    if (res.success) {
      setLocations((prev) => prev.filter((l) => l.id !== id));
      setToast({ message: "Ubicación eliminada", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setDeleting(null);
  }

  function updateForm(field: keyof LocationForm, value: string) {
    if (editing) setEditing({ ...editing, [field]: value });
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
          ← Volver a ubicaciones
        </button>
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
          {creating
            ? "Agregar ubicación"
            : `Editar: ${(form as Location).name}`}
        </h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Nombre" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    placeholder="Universidad Tecnológica Del Perú (UTP) - Sede Ica"
                    className={inputClass}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Dirección">
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => updateForm("address", e.target.value)}
                    placeholder="Av. Ayabaca S/N, Ica 11001"
                    className={inputClass}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Google Maps URL">
                  <input
                    type="url"
                    value={form.map_url}
                    onChange={(e) => updateForm("map_url", e.target.value)}
                    placeholder="https://maps.app.goo.gl/..."
                    className={inputClass}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Google Maps Embed URL">
                  <input
                    type="url"
                    value={form.map_embed}
                    onChange={(e) => updateForm("map_embed", e.target.value)}
                    placeholder="https://www.google.com/maps/embed?pb=..."
                    className={inputClass}
                  />
                </FormField>
              </div>
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

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ubicación..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-64 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />
          <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} ubicación{filtered.length !== 1 && "es"}
          </span>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Agregar ubicación
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Dirección
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginated.map((loc) => (
              <tr
                key={loc.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {loc.name}
                  </p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {loc.address || "—"}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(loc)}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(loc.id, loc.name)}
                      disabled={deleting === loc.id}
                      className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      {deleting === loc.id ? "..." : "Eliminar"}
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
        {paginated.map((loc) => (
          <div
            key={loc.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <p className="font-medium text-gray-900 dark:text-white">
              {loc.name}
            </p>
            {loc.address && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {loc.address}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              <button
                onClick={() => setEditing(loc)}
                className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(loc.id, loc.name)}
                disabled={deleting === loc.id}
                className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {deleting === loc.id ? "..." : "Eliminar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {paginated.length === 0 && (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          {search ? "Sin resultados" : "No hay ubicaciones guardadas."}
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
