import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import {
  ArrowIcon,
  CornerNodes,
  ErrorState,
  HeaderActions,
  LoadingState,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { describeLocationError } from "./errors";

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

const dangerClass =
  "text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50";

function pluralize(count: number) {
  return count === 1 ? "ubicación" : "ubicaciones";
}

function LocationRow({
  location,
  deleting,
  onEdit,
  onDelete,
}: {
  location: Location;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="border-atlas-line grid grid-cols-1 gap-y-4 border-b py-5 last:border-b-0 @3xl:grid-cols-[1fr_auto] @3xl:items-center @3xl:gap-x-6">
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {location.name || "Sin nombre"}
        </p>
        <p
          className={`mt-1 text-sm ${location.address ? "text-atlas-mist" : "text-atlas-fog"}`}
        >
          {location.address || "Sin dirección"}
        </p>
        <p className="text-atlas-fog mt-0.5 text-xs">
          {location.map_url ? "Con enlace a Maps" : "Sin enlace a Maps"}
          {" · "}
          {location.map_embed ? "Con mapa incrustado" : "Sin mapa incrustado"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 @3xl:justify-end">
        <button
          type="button"
          onClick={onEdit}
          className={buttonClass.secondary}
        >
          Editar
        </button>
        {location.map_url && (
          <a
            href={location.map_url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass.quiet}
          >
            Abrir en Maps
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className={dangerClass}
        >
          {deleting ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </li>
  );
}

export function LocationList() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [editing, setEditing] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingForm, setCreatingForm] = useState<LocationForm>({
    ...EMPTY_LOCATION,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const form: LocationForm | null = editing || (creating ? creatingForm : null);

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
    setError(false);
    const res = await api.listLocations();
    if (res.success && res.data) {
      setLocations(res.data as Location[]);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  function openCreate() {
    setCreatingForm({ ...EMPTY_LOCATION });
    setCreating(true);
    setEditing(null);
    setSaveError(null);
  }

  function openEdit(location: Location) {
    setEditing(location);
    setCreating(false);
    setSaveError(null);
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setCreatingForm({ ...EMPTY_LOCATION });
    setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
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
        message: `Ubicación «${form.name}» ${isNew ? "agregada" : "actualizada"}`,
        type: "success",
      });
      closeForm();
      loadLocations();
    } else {
      setSaveError(
        describeLocationError(
          res.error,
          "No se pudo guardar la ubicación. Revisa los enlaces e inténtalo de nuevo."
        )
      );
    }
    setSaving(false);
  }

  async function handleDelete(location: Location) {
    if (
      !confirm(
        `¿Eliminar la ubicación «${location.name || "sin nombre"}»? Los eventos que ya la usan conservan sus datos.`
      )
    )
      return;
    setDeleting(location.id);
    const res = await api.deleteLocation(location.id);
    if (res.success) {
      setLocations((prev) => prev.filter((l) => l.id !== location.id));
      setToast({
        message: `Ubicación «${location.name}» eliminada`,
        type: "success",
      });
    } else {
      setToast({
        message: describeLocationError(
          res.error,
          "No se pudo eliminar la ubicación. Inténtalo de nuevo."
        ),
        type: "error",
      });
    }
    setDeleting(null);
  }

  function updateForm(field: keyof LocationForm, value: string) {
    if (editing) setEditing({ ...editing, [field]: value });
    else if (creating) setCreatingForm((prev) => ({ ...prev, [field]: value }));
  }

  const toastNode = toast && (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );

  if (form) {
    const missingName = !form.name.trim();
    return (
      <div className="mx-auto max-w-6xl">
        {toastNode}
        <button
          type="button"
          onClick={closeForm}
          className={`${buttonClass.quiet} mb-6 -ml-2`}
        >
          <ArrowIcon className="size-4 rotate-180" />
          Volver a ubicaciones
        </button>

        <form
          onSubmit={handleSave}
          className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
        >
          <section aria-labelledby="ubicacion-form">
            <SectionHeading>
              <span id="ubicacion-form">
                {creating ? "Nueva ubicación" : "Editar ubicación"}
              </span>
            </SectionHeading>
            <p className="text-atlas-mist mb-6 text-sm">
              Una ubicación guardada sirve para rellenar la sede de un evento
              con un clic.
            </p>
            <div className="grid gap-5">
              <FormField label="Nombre" required>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder="Universidad Tecnológica del Perú (UTP), sede Ica"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Dirección">
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  placeholder="Av. Ayabaca S/N, Ica 11001"
                  className={inputClass}
                />
              </FormField>
              <div>
                <FormField label="Enlace de Google Maps">
                  <input
                    type="url"
                    value={form.map_url}
                    onChange={(e) => updateForm("map_url", e.target.value)}
                    placeholder="https://maps.app.goo.gl/…"
                    className={inputClass}
                  />
                </FormField>
                <p className="text-atlas-fog mt-1.5 text-xs">
                  En Maps: «Compartir», luego «Copiar vínculo». Es el botón «Ver
                  en Google Maps» de la página del evento.
                </p>
              </div>
              <div>
                <FormField label="Enlace para incrustar el mapa">
                  <input
                    type="url"
                    value={form.map_embed}
                    onChange={(e) => updateForm("map_embed", e.target.value)}
                    placeholder="https://www.google.com/maps/embed?pb=…"
                    className={inputClass}
                  />
                </FormField>
                <p className="text-atlas-fog mt-1.5 text-xs">
                  En Maps: «Compartir», pestaña «Insertar un mapa». Pega solo el
                  valor de src, sin la etiqueta iframe. Sin él, la página del
                  evento no muestra el mapa.
                </p>
              </div>
            </div>
          </section>

          <aside
            aria-label="Resumen de la ubicación"
            className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
          >
            <CornerNodes />
            <p className="atlas-label text-atlas-glow">
              {creating ? "Resumen" : "Editando"}
            </p>
            <p className="atlas-name text-atlas-dust mt-3 text-lg leading-snug">
              {form.name.trim() || "Sin nombre todavía"}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Dirección</dt>
                <dd className="text-atlas-dust min-w-0 text-right break-words">
                  {form.address.trim() || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Enlace a Maps</dt>
                <dd className="text-atlas-dust">
                  {form.map_url.trim() ? "Sí" : "No"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Mapa incrustado</dt>
                <dd className="text-atlas-dust">
                  {form.map_embed.trim() ? "Sí" : "No"}
                </dd>
              </div>
            </dl>

            {missingName && (
              <p className="text-atlas-mist mt-4 text-sm">Falta: nombre.</p>
            )}

            {saveError && (
              <p
                role="alert"
                className="border-atlas-rose/40 bg-atlas-rose/5 text-atlas-dust mt-4 rounded-md border px-3 py-2.5 text-sm"
              >
                {saveError}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || missingName}
              className={`${buttonClass.primary} mt-5 w-full`}
            >
              {saving
                ? "Guardando…"
                : creating
                  ? "Agregar ubicación"
                  : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className={`${buttonClass.secondary} mt-2 w-full`}
            >
              Cancelar
            </button>
            <p className="text-atlas-fog mt-3 text-xs leading-snug">
              Al elegirla en un evento sus datos se copian. Cambiarla aquí no
              modifica los eventos que ya la usan.
            </p>
          </aside>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <HeaderActions>
        <button
          type="button"
          onClick={openCreate}
          className={buttonClass.primary}
        >
          Nueva ubicación
        </button>
      </HeaderActions>

      {toastNode}

      {loading ? (
        <LoadingState label="Cargando ubicaciones…" />
      ) : error ? (
        <ErrorState
          message="No se pudieron cargar las ubicaciones. Revisa tu conexión e inténtalo de nuevo."
          onRetry={loadLocations}
        />
      ) : locations.length === 0 ? (
        <div className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          Todavía no hay ubicaciones guardadas. Guarda una sede para elegirla
          con un clic al crear un evento.{" "}
          <button
            type="button"
            onClick={openCreate}
            className="text-atlas-dust font-semibold underline underline-offset-4"
          >
            Agrega la primera
          </button>
          .
        </div>
      ) : (
        <section aria-labelledby="ubicaciones-guardadas" className="@container">
          <SectionHeading
            action={
              <span className="text-atlas-fog text-sm tabular-nums">
                {filtered.length} {pluralize(filtered.length)}
              </span>
            }
          >
            <span id="ubicaciones-guardadas">Guardadas</span>
          </SectionHeading>

          <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="buscar-ubicacion" className="sr-only">
              Buscar ubicación
            </label>
            <input
              id="buscar-ubicacion"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o dirección"
              className={`${inputClass} sm:max-w-xs`}
            />
            <p className="text-atlas-fog text-sm">
              Se eligen en el formulario del evento, en «Cargar ubicación
              guardada».
            </p>
          </div>

          {paginated.length === 0 ? (
            <div className="border-atlas-line text-atlas-mist mt-4 rounded-xs border border-dashed px-5 py-8 text-sm">
              Ninguna ubicación coincide con «{search.trim()}».{" "}
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-atlas-dust font-semibold underline underline-offset-4"
              >
                Limpiar la búsqueda
              </button>
              .
            </div>
          ) : (
            <ul>
              {paginated.map((loc) => (
                <LocationRow
                  key={loc.id}
                  location={loc}
                  deleting={deleting === loc.id}
                  onEdit={() => openEdit(loc)}
                  onDelete={() => handleDelete(loc)}
                />
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Páginas de ubicaciones"
              className="border-atlas-line mt-2 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-atlas-fog text-sm tabular-nums">
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} de{" "}
                {filtered.length}
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={buttonClass.quiet}
                >
                  Anterior
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === page ? "page" : undefined}
                      className={`min-w-9 rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                        p === page
                          ? "bg-atlas-deep text-atlas-dust"
                          : "text-atlas-mist hover:text-atlas-dust"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={buttonClass.quiet}
                >
                  Siguiente
                </button>
              </div>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
