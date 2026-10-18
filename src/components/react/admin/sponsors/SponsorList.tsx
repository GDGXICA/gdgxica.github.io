import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toImagePath } from "@/lib/image";
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

const deleteClass =
  "text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50";

function siteHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function SponsorLogo({
  sponsor,
}: {
  sponsor: Pick<Sponsor, "name" | "logo_url">;
}) {
  if (sponsor.logo_url) {
    return (
      <img
        src={toImagePath(sponsor.logo_url)}
        alt=""
        loading="lazy"
        className="bg-atlas-dust border-atlas-line size-10 rounded-xs border object-contain p-1"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="atlas-name bg-atlas-deep border-atlas-line text-atlas-dust grid size-10 place-items-center rounded-xs border text-base"
    >
      {sponsor.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function describeSponsor(sponsor: Pick<Sponsor, "sector" | "url">) {
  return [sponsor.sector, siteHost(sponsor.url)].filter(Boolean).join(" · ");
}

function SponsorRow({
  sponsor,
  deleting,
  onEdit,
  onDelete,
}: {
  sponsor: Sponsor;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const detail = describeSponsor(sponsor);
  const host = siteHost(sponsor.url);

  return (
    <li className="border-atlas-line grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-3 border-b py-4 last:border-b-0 @3xl:grid-cols-[2.5rem_1fr_auto] @3xl:items-center">
      <div className="row-span-2 self-start pt-0.5 @3xl:row-span-1 @3xl:self-center">
        <SponsorLogo sponsor={sponsor} />
      </div>
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {sponsor.name}
        </p>
        <p className="text-atlas-mist mt-1 text-sm">
          {detail || "Sin sector ni sitio web"}
        </p>
        {sponsor.description && (
          <p className="text-atlas-fog mt-0.5 line-clamp-1 text-xs">
            {sponsor.description}
          </p>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 @3xl:col-start-auto @3xl:justify-end">
        <button
          type="button"
          onClick={onEdit}
          className={buttonClass.secondary}
        >
          Editar
        </button>
        {host && (
          <a
            href={sponsor.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass.quiet}
          >
            Ver sitio
            <span className="sr-only">
              {" "}
              de {sponsor.name} (abre otra pestaña)
            </span>
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className={deleteClass}
        >
          {deleting ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </li>
  );
}

export function SponsorList() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
    setError(false);
    const res = await api.listSponsors();
    if (res.success && res.data) {
      setSponsors(res.data as Sponsor[]);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  function openCreate() {
    setCreating(true);
    setEditing({ ...EMPTY_SPONSOR });
  }

  function openEdit(sponsor: Sponsor) {
    setCreating(false);
    setEditing(sponsor);
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
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
        message: isNew
          ? `${form.name} ya está entre los sponsors`
          : `Cambios guardados en ${form.name}`,
        type: "success",
      });
      closeForm();
      loadSponsors();
    } else {
      setToast({
        message: `No se pudo guardar a ${form.name || "este sponsor"}. Revisa que los enlaces empiecen con https:// e inténtalo de nuevo.`,
        type: "error",
      });
    }
    setSaving(false);
  }

  async function handleDelete(sponsor: Sponsor) {
    if (
      !confirm(
        `¿Eliminar a «${sponsor.name}» de los sponsors? Su logo desaparecerá del sitio público.`
      )
    )
      return;
    setDeleting(sponsor.name);
    const res = await api.deleteSponsor(sponsor.name);
    if (res.success) {
      setSponsors((prev) => prev.filter((s) => s.name !== sponsor.name));
      setToast({
        message: `${sponsor.name} ya no figura como sponsor`,
        type: "success",
      });
    } else {
      setToast({
        message: `No se pudo eliminar a ${sponsor.name}. Inténtalo de nuevo.`,
        type: "error",
      });
    }
    setDeleting(null);
  }

  const toastNode = toast && (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );

  if (form) {
    const ready = form.name.trim() !== "";
    const host = siteHost(form.url);

    return (
      <div className="mx-auto max-w-6xl">
        {toastNode}
        <button
          type="button"
          onClick={closeForm}
          className={`${buttonClass.quiet} mb-6 -ml-2`}
        >
          <ArrowIcon className="size-4 rotate-180" />
          Volver a sponsors
        </button>

        <form
          onSubmit={handleSave}
          className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div className="space-y-10">
            <section aria-labelledby="sponsor-datos">
              <SectionHeading>
                <span id="sponsor-datos">Datos</span>
              </SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FormField label="Nombre" required>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => updateForm("name", e.target.value)}
                      placeholder="Google"
                      className={inputClass}
                      disabled={!creating}
                    />
                  </FormField>
                  <p className="text-atlas-fog mt-1 text-xs">
                    {creating
                      ? "Identifica al sponsor. No se puede cambiar después."
                      : "Identifica al sponsor; no se puede cambiar."}
                  </p>
                </div>
                <FormField label="Sector">
                  <input
                    type="text"
                    value={form.sector}
                    onChange={(e) => updateForm("sector", e.target.value)}
                    placeholder="Tecnología"
                    className={inputClass}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Descripción">
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        updateForm("description", e.target.value)
                      }
                      rows={4}
                      className={inputClass}
                    />
                  </FormField>
                </div>
              </div>
            </section>

            <section aria-labelledby="sponsor-enlaces">
              <SectionHeading>
                <span id="sponsor-enlaces">Enlaces</span>
              </SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="URL del logo">
                  <input
                    type="url"
                    value={form.logo_url}
                    onChange={(e) => updateForm("logo_url", e.target.value)}
                    placeholder="https://gdgica.com/sponsors/logo.svg"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Sitio web">
                  <input
                    type="url"
                    value={form.url}
                    onChange={(e) => updateForm("url", e.target.value)}
                    placeholder="https://"
                    className={inputClass}
                  />
                </FormField>
              </div>
            </section>

            <section aria-labelledby="sponsor-visibilidad">
              <SectionHeading>
                <span id="sponsor-visibilidad">Visibilidad</span>
              </SectionHeading>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => updateForm("featured", e.target.checked)}
                  className="accent-atlas-ember mt-0.5 size-4 shrink-0"
                />
                <span>
                  <span className="text-atlas-dust block font-semibold">
                    Destacado
                  </span>
                  <span className="text-atlas-mist block">
                    Aparece arriba, en la sección principal de la página de
                    sponsors. Los demás se listan debajo.
                  </span>
                </span>
              </label>
            </section>
          </div>

          <aside
            aria-label="Resumen del sponsor"
            className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
          >
            <CornerNodes />
            <p className="atlas-label text-atlas-glow">
              {creating ? "Nuevo sponsor" : "Editando"}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <SponsorLogo sponsor={form} />
              <p className="atlas-name text-atlas-dust min-w-0 text-lg leading-snug break-words">
                {form.name.trim() || "Sin nombre todavía"}
              </p>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Sector</dt>
                <dd className="text-atlas-dust text-right">
                  {form.sector || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Sitio</dt>
                <dd className="text-atlas-dust min-w-0 truncate text-right">
                  {host || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">En la página</dt>
                <dd className="text-atlas-dust text-right">
                  {form.featured ? "Destacado" : "Lista general"}
                </dd>
              </div>
            </dl>

            {!ready && (
              <p className="text-atlas-mist mt-4 text-sm">Falta: nombre.</p>
            )}

            <button
              type="submit"
              disabled={saving || !ready}
              className={`${buttonClass.primary} mt-5 w-full`}
            >
              {saving
                ? "Guardando…"
                : creating
                  ? "Agregar sponsor"
                  : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className={`${buttonClass.quiet} mt-2 w-full justify-center`}
            >
              Cancelar
            </button>
          </aside>
        </form>
      </div>
    );
  }

  const groups = [
    {
      id: "destacados",
      label: "Destacados",
      list: sponsors.filter((s) => s.featured),
    },
    {
      id: "otros",
      label: "Lista general",
      list: sponsors.filter((s) => !s.featured),
    },
  ].filter((group) => group.list.length > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <HeaderActions>
        <button
          type="button"
          onClick={openCreate}
          className={buttonClass.primary}
        >
          Nuevo sponsor
        </button>
      </HeaderActions>

      {toastNode}

      {loading ? (
        <LoadingState label="Cargando sponsors…" />
      ) : error ? (
        <ErrorState
          message="No se pudieron cargar los sponsors. Suele ser la conexión con el repositorio de datos."
          onRetry={loadSponsors}
        />
      ) : sponsors.length === 0 ? (
        <div className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          Todavía no hay sponsors.{" "}
          <button
            type="button"
            onClick={openCreate}
            className="text-atlas-dust font-semibold underline underline-offset-4"
          >
            Agrega el primero
          </button>
          .
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`sponsors-${group.id}`}
            className="@container"
          >
            <SectionHeading
              action={
                <span className="text-atlas-fog text-sm tabular-nums">
                  {group.list.length}{" "}
                  {group.list.length === 1 ? "sponsor" : "sponsors"}
                </span>
              }
            >
              <span id={`sponsors-${group.id}`}>{group.label}</span>
            </SectionHeading>
            <ul>
              {group.list.map((sponsor) => (
                <SponsorRow
                  key={sponsor.name}
                  sponsor={sponsor}
                  deleting={deleting === sponsor.name}
                  onEdit={() => openEdit(sponsor)}
                  onDelete={() => handleDelete(sponsor)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
