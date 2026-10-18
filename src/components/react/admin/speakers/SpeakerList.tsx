import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toImagePath } from "@/lib/image";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import {
  ArrowIcon,
  CloseIcon,
  CornerNodes,
  ErrorState,
  HeaderActions,
  LoadingState,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";

interface Speaker {
  id: string;
  name: string;
  bio: string;
  photo_url: string;
  company: string;
  role: string;
  topics: string[];
  social_links: Record<string, string>;
  talk_ids: string[];
}

const EMPTY_SPEAKER: Speaker = {
  id: "",
  name: "",
  bio: "",
  photo_url: "",
  company: "",
  role: "",
  topics: [],
  social_links: {},
  talk_ids: [],
};

const PAGE_SIZE = 10;

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

const SOCIAL_FIELDS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "github", label: "GitHub" },
  { key: "twitter", label: "X (Twitter)" },
  { key: "web", label: "Sitio web" },
];

const deleteClass =
  "text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50";

function SpeakerAvatar({
  speaker,
}: {
  speaker: Pick<Speaker, "name" | "photo_url">;
}) {
  if (speaker.photo_url) {
    return (
      <img
        src={toImagePath(speaker.photo_url)}
        alt=""
        loading="lazy"
        className="bg-atlas-deep border-atlas-line size-10 rounded-full border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="atlas-name bg-atlas-deep border-atlas-line text-atlas-dust grid size-10 place-items-center rounded-full border text-base"
    >
      {speaker.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function describeSpeaker(speaker: Pick<Speaker, "role" | "company">) {
  return [speaker.role, speaker.company].filter(Boolean).join(" · ");
}

function SpeakerRow({
  speaker,
  deleting,
  onEdit,
  onDelete,
}: {
  speaker: Speaker;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const detail = describeSpeaker(speaker);
  const shownTopics = speaker.topics.slice(0, 4);
  const extraTopics = speaker.topics.length - shownTopics.length;

  return (
    <li className="border-atlas-line grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-3 border-b py-4 last:border-b-0 @3xl:grid-cols-[2.5rem_1fr_auto] @3xl:items-center">
      <div className="row-span-2 self-start pt-0.5 @3xl:row-span-1 @3xl:self-center">
        <SpeakerAvatar speaker={speaker} />
      </div>
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {speaker.name || speaker.id}
        </p>
        <p className="text-atlas-mist mt-1 text-sm">
          {detail || "Sin cargo ni empresa"}
        </p>
        {shownTopics.length > 0 && (
          <p className="text-atlas-fog mt-0.5 text-xs">
            {shownTopics.join(" · ")}
            {extraTopics > 0 && ` · y ${extraTopics} más`}
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

export function SpeakerList() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const form = editing || (creating ? EMPTY_SPEAKER : null);

  useEffect(() => {
    loadSpeakers();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return speakers;
    const q = search.toLowerCase();
    return speakers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        s.topics.some((t) => t.toLowerCase().includes(q))
    );
  }, [speakers, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function loadSpeakers() {
    setLoading(true);
    setError(false);
    const res = await api.listSpeakers();
    if (res.success && res.data) {
      setSpeakers(res.data as Speaker[]);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  function openCreate() {
    setCreating(true);
    setEditing({ ...EMPTY_SPEAKER });
    setTopicInput("");
  }

  function openEdit(speaker: Speaker) {
    setCreating(false);
    setEditing(speaker);
    setTopicInput("");
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setTopicInput("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const isNew = creating;
    const res = isNew
      ? await api.addSpeaker(form)
      : await api.updateSpeaker(form.id, form);

    if (res.success) {
      setToast({
        message: isNew
          ? `${form.name} ya está entre los speakers`
          : `Cambios guardados en ${form.name}`,
        type: "success",
      });
      closeForm();
      loadSpeakers();
    } else {
      setToast({
        message: `No se pudo guardar a ${form.name || "este speaker"}. Revisa que los enlaces empiecen con https:// e inténtalo de nuevo.`,
        type: "error",
      });
    }
    setSaving(false);
  }

  async function handleDelete(speaker: Speaker) {
    const label = speaker.name || speaker.id;
    if (
      !confirm(
        `¿Eliminar a «${label}» de los speakers? Su ficha desaparecerá del sitio público.`
      )
    )
      return;
    setDeleting(speaker.id);
    const res = await api.deleteSpeaker(speaker.id);
    if (res.success) {
      setSpeakers((prev) => prev.filter((s) => s.id !== speaker.id));
      setToast({
        message: `${label} ya no figura como speaker`,
        type: "success",
      });
    } else {
      setToast({
        message: `No se pudo eliminar a ${label}. Inténtalo de nuevo.`,
        type: "error",
      });
    }
    setDeleting(null);
  }

  function updateForm(field: keyof Speaker, value: unknown) {
    if (editing) setEditing({ ...editing, [field]: value });
  }

  function addTopic() {
    if (!form || !topicInput.trim()) return;
    updateForm("topics", [...form.topics, topicInput.trim()]);
    setTopicInput("");
  }

  const toastNode = toast && (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );

  if (form) {
    const idInvalid = creating && form.id !== "" && !ID_PATTERN.test(form.id);
    const missing = [
      !form.name.trim() && "nombre",
      creating && !form.id && "ID",
    ].filter(Boolean) as string[];
    const ready = missing.length === 0 && !idInvalid;
    const detail = describeSpeaker(form);
    const socialCount = SOCIAL_FIELDS.filter(
      ({ key }) => form.social_links[key]
    ).length;

    return (
      <div className="mx-auto max-w-6xl">
        {toastNode}
        <button
          type="button"
          onClick={closeForm}
          className={`${buttonClass.quiet} mb-6 -ml-2`}
        >
          <ArrowIcon className="size-4 rotate-180" />
          Volver a speakers
        </button>

        <form
          onSubmit={handleSave}
          className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div className="space-y-10">
            <section aria-labelledby="speaker-identidad">
              <SectionHeading>
                <span id="speaker-identidad">Identidad</span>
              </SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nombre" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    placeholder="María García"
                    className={inputClass}
                  />
                </FormField>
                <div>
                  <FormField
                    label="ID"
                    required
                    error={
                      idInvalid
                        ? "Solo letras sin tildes, números, guiones y guion bajo."
                        : undefined
                    }
                  >
                    <input
                      type="text"
                      value={form.id}
                      onChange={(e) => updateForm("id", e.target.value)}
                      placeholder="maria-garcia"
                      className={inputClass}
                      disabled={!creating}
                    />
                  </FormField>
                  {!idInvalid && (
                    <p className="text-atlas-fog mt-1 text-xs">
                      {creating
                        ? "Con él se enlaza el speaker a sus eventos. No se puede cambiar después."
                        : "Con él se enlaza el speaker a sus eventos; no se puede cambiar."}
                    </p>
                  )}
                </div>
                <FormField label="Cargo">
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => updateForm("role", e.target.value)}
                    placeholder="Staff Engineer"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Empresa">
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => updateForm("company", e.target.value)}
                    className={inputClass}
                  />
                </FormField>
              </div>
            </section>

            <section aria-labelledby="speaker-presentacion">
              <SectionHeading>
                <span id="speaker-presentacion">Presentación</span>
              </SectionHeading>
              <div className="space-y-4">
                <FormField label="Bio">
                  <textarea
                    value={form.bio}
                    onChange={(e) => updateForm("bio", e.target.value)}
                    rows={4}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="URL de la foto">
                  <input
                    type="url"
                    value={form.photo_url}
                    onChange={(e) => updateForm("photo_url", e.target.value)}
                    placeholder="https://gdgica.com/speakers/foto.webp"
                    className={inputClass}
                  />
                </FormField>
              </div>
            </section>

            <section aria-labelledby="speaker-temas">
              <SectionHeading>
                <span id="speaker-temas">Temas</span>
              </SectionHeading>
              <div className="flex gap-2">
                <label htmlFor="speaker-tema" className="sr-only">
                  Nuevo tema
                </label>
                <input
                  id="speaker-tema"
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTopic();
                    }
                  }}
                  placeholder="Kubernetes, Angular, IA…"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={addTopic}
                  disabled={!topicInput.trim()}
                  className={`${buttonClass.secondary} shrink-0`}
                >
                  Agregar
                </button>
              </div>
              {form.topics.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {form.topics.map((topic, i) => (
                    <li
                      key={i}
                      className="border-atlas-line text-atlas-dust inline-flex items-center gap-1 rounded-xs border py-1 pr-1 pl-2.5 text-sm"
                    >
                      {topic}
                      <button
                        type="button"
                        onClick={() =>
                          updateForm(
                            "topics",
                            form.topics.filter((_, idx) => idx !== i)
                          )
                        }
                        aria-label={`Quitar ${topic}`}
                        className="text-atlas-fog hover:text-atlas-rose rounded-xs p-0.5 transition-colors"
                      >
                        <CloseIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-atlas-fog mt-2 text-sm">
                  Escribe un tema y pulsa Enter para agregarlo.
                </p>
              )}
            </section>

            <section aria-labelledby="speaker-redes">
              <SectionHeading>
                <span id="speaker-redes">Redes</span>
              </SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL_FIELDS.map(({ key, label }) => (
                  <FormField key={key} label={label}>
                    <input
                      type="url"
                      value={form.social_links[key] || ""}
                      onChange={(e) =>
                        updateForm("social_links", {
                          ...form.social_links,
                          [key]: e.target.value,
                        })
                      }
                      placeholder="https://"
                      className={inputClass}
                    />
                  </FormField>
                ))}
              </div>
            </section>
          </div>

          <aside
            aria-label="Resumen del speaker"
            className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
          >
            <CornerNodes />
            <p className="atlas-label text-atlas-glow">
              {creating ? "Nuevo speaker" : "Editando"}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <SpeakerAvatar speaker={form} />
              <div className="min-w-0">
                <p className="atlas-name text-atlas-dust text-lg leading-snug break-words">
                  {form.name.trim() || "Sin nombre todavía"}
                </p>
                {detail && <p className="text-atlas-mist text-sm">{detail}</p>}
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">ID</dt>
                <dd className="text-atlas-dust min-w-0 truncate text-right">
                  {form.id || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Temas</dt>
                <dd className="text-atlas-dust tabular-nums">
                  {form.topics.length}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Redes</dt>
                <dd className="text-atlas-dust tabular-nums">{socialCount}</dd>
              </div>
            </dl>

            {!ready && (
              <p className="text-atlas-mist mt-4 text-sm">
                {idInvalid
                  ? "Corrige el ID: solo letras sin tildes, números, guiones y guion bajo."
                  : `Falta: ${missing.join(", ")}.`}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !ready}
              className={`${buttonClass.primary} mt-5 w-full`}
            >
              {saving
                ? "Guardando…"
                : creating
                  ? "Agregar speaker"
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

  return (
    <div className="mx-auto max-w-6xl">
      <HeaderActions>
        <button
          type="button"
          onClick={openCreate}
          className={buttonClass.primary}
        >
          Nuevo speaker
        </button>
      </HeaderActions>

      {toastNode}

      {loading ? (
        <LoadingState label="Cargando speakers…" />
      ) : error ? (
        <ErrorState
          message="No se pudieron cargar los speakers. Suele ser la conexión con el repositorio de datos."
          onRetry={loadSpeakers}
        />
      ) : speakers.length === 0 ? (
        <div className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          Todavía no hay speakers.{" "}
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
        <section aria-label="Speakers" className="@container">
          <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="speaker-buscar" className="sr-only">
              Buscar speakers
            </label>
            <input
              id="speaker-buscar"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa o tema"
              className={`${inputClass} sm:max-w-sm`}
            />
            <p className="text-atlas-fog shrink-0 text-sm tabular-nums">
              {search.trim()
                ? `${filtered.length} de ${speakers.length} speakers`
                : `${speakers.length} ${speakers.length === 1 ? "speaker" : "speakers"}`}
            </p>
          </div>

          {paginated.length === 0 ? (
            <div className="border-atlas-line text-atlas-mist mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xs border border-dashed px-5 py-8 text-sm">
              <span>Ningún speaker coincide con «{search.trim()}».</span>
              <button
                type="button"
                onClick={() => setSearch("")}
                className={`${buttonClass.quiet} -my-1.5`}
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <ul>
              {paginated.map((speaker) => (
                <SpeakerRow
                  key={speaker.id}
                  speaker={speaker}
                  deleting={deleting === speaker.id}
                  onEdit={() => openEdit(speaker)}
                  onDelete={() => handleDelete(speaker)}
                />
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Páginas de speakers"
              className="border-atlas-line mt-2 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
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
                  className={`${buttonClass.quiet} disabled:opacity-50`}
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
                      className={`min-w-9 rounded-md border px-2 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                        p === page
                          ? "border-atlas-mist bg-atlas-deep text-atlas-dust"
                          : "text-atlas-mist hover:text-atlas-dust border-transparent"
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
                  className={`${buttonClass.quiet} disabled:opacity-50`}
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
