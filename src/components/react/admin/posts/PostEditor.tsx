import { useMemo, useRef, useState } from "react";
import { api, type Post } from "@/lib/api";
import { renderMarkdownPreview } from "@/lib/markdown";
import { FormField } from "../ui/FormField";
import { prepareImage } from "./prepareImage";
import { slugify, slugifyWhileTyping } from "./slugify";

interface Props {
  /** `null` para un post nuevo. */
  initial: Post | null;
  /**
   * Guarda. Devuelve `null` si fue bien, o el mensaje de error.
   *
   * El editor no llama a la API por su cuenta porque tiene dos destinos: el
   * panel del foro lo escribe directo en el repo de datos, y el de propuestas
   * lo manda a revisión. Lo que cambia entre los dos es exactamente esta
   * función, no el formulario.
   */
  onSubmit: (post: Post) => Promise<string | null>;
  onCancel: () => void;
  onError: (message: string) => void;
  /**
   * El flujo de propuestas no elige el estado: publicar es la decisión de
   * quien revisa, y ofrecer aquí un desplegable "Publicado" prometería algo
   * que este camino no puede cumplir.
   */
  showStatus?: boolean;
  /** Texto del botón. Por defecto depende del estado elegido. */
  submitLabel?: string;
  /** Encabezado de la pantalla. Por defecto, crear o editar un post. */
  heading?: string;
}

const EMPTY: Post = {
  id: "",
  title: "",
  excerpt: "",
  cover_image_url: "",
  tags: [],
  author_name: "",
  author_photo_url: "",
  published_at: "",
  status: "draft",
  body: "",
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400";

/**
 * Lo que hace cada botón de la barra: el texto que va antes y después de lo
 * seleccionado, y lo que se escribe si no hay nada seleccionado.
 */
const TOOLS: {
  label: string;
  title: string;
  before: string;
  after: string;
  placeholder: string;
  /** Los de bloque van al principio de la línea, no alrededor. */
  block?: boolean;
}[] = [
  {
    label: "H2",
    title: "Título de sección",
    before: "## ",
    after: "",
    placeholder: "Título",
    block: true,
  },
  {
    label: "B",
    title: "Negrita",
    before: "**",
    after: "**",
    placeholder: "texto",
  },
  {
    label: "i",
    title: "Cursiva",
    before: "_",
    after: "_",
    placeholder: "texto",
  },
  {
    label: "🔗",
    title: "Enlace",
    before: "[",
    after: "](https://)",
    placeholder: "texto del enlace",
  },
  {
    label: "•",
    title: "Lista",
    before: "- ",
    after: "",
    placeholder: "elemento",
    block: true,
  },
  {
    label: "❝",
    title: "Cita",
    before: "> ",
    after: "",
    placeholder: "cita",
    block: true,
  },
  {
    label: "</>",
    title: "Bloque de código",
    before: "```\n",
    after: "\n```",
    placeholder: "código",
  },
];

export function PostEditor({
  initial,
  onSubmit,
  onCancel,
  onError,
  showStatus = true,
  submitLabel,
  heading,
}: Props) {
  const creating = initial === null;
  const [form, setForm] = useState<Post>(initial ?? EMPTY);
  // Solo mientras el slug no se haya tocado a mano: quien lo edita manda, y
  // seguir reescribiéndolo al teclear el título le borraría lo que puso.
  const [slugTouched, setSlugTouched] = useState(!creating);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"body" | "cover" | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodyFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => renderMarkdownPreview(form.body), [form.body]);
  // El mismo aviso que daría la API al guardar, pero mientras se escribe: el
  // cuerpo con HTML en crudo se rechaza, y enterarse al pulsar "Guardar" es
  // enterarse tarde.
  const bodyError = "error" in preview ? preview.error : null;

  function update<K extends keyof Post>(field: K, value: Post[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleTitle(title: string) {
    setForm((prev) => ({
      ...prev,
      title,
      id: slugTouched ? prev.id : slugify(title),
    }));
  }

  /** Mete markdown en la posición del cursor del cuerpo. */
  function insert(before: string, after: string, placeholder: string) {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = form.body.slice(start, end) || placeholder;
    const next =
      form.body.slice(0, start) +
      before +
      selected +
      after +
      form.body.slice(end);

    update("body", next);

    // El cursor queda envolviendo lo insertado, para poder seguir escribiendo
    // encima sin ir a buscarlo con el ratón.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selected.length
      );
    });
  }

  function applyTool(tool: (typeof TOOLS)[number]) {
    if (!tool.block) {
      insert(tool.before, tool.after, tool.placeholder);
      return;
    }
    // Un prefijo de bloque va al principio de la línea; ponerlo a mitad no
    // produce markdown válido.
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = form.body.lastIndexOf("\n", start - 1) + 1;
    const next =
      form.body.slice(0, lineStart) + tool.before + form.body.slice(lineStart);
    update("body", next);
    requestAnimationFrame(() => {
      textarea.focus();
      const at = start + tool.before.length;
      textarea.setSelectionRange(at, at);
    });
  }

  async function upload(file: File, target: "body" | "cover") {
    setUploading(target);
    const prepared = await prepareImage(file);
    if ("error" in prepared) {
      onError(prepared.error);
      setUploading(null);
      return;
    }

    const res = await api.uploadPostImage(prepared.dataUrl);
    setUploading(null);
    if (!res.success || !res.data) {
      onError(res.error || "No se pudo subir la imagen");
      return;
    }

    if (target === "cover") update("cover_image_url", res.data.url);
    else insert("![", `](${res.data.url})`, "descripción de la imagen");
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag)) {
      setTagInput("");
      return;
    }
    update("tags", [...form.tags, tag]);
    setTagInput("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (bodyError) {
      onError(bodyError);
      return;
    }
    if (!form.id) {
      onError("Hace falta un identificador (se genera del título)");
      return;
    }

    setSaving(true);
    const error = await onSubmit(form);
    setSaving(false);
    if (error) onError(error);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button
        onClick={onCancel}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        ← Volver
      </button>
      <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
        {heading ?? (creating ? "Nuevo post" : `Editar: ${form.title}`)}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField label="Título" required>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => handleTitle(e.target.value)}
                  placeholder="Lo que dejó el DevFest"
                  className={inputClass}
                />
              </FormField>
            </div>

            <FormField
              label="Identificador (URL)"
              required
              error={
                creating && !form.id && form.title
                  ? "El título no deja caracteres utilizables; escríbelo a mano"
                  : undefined
              }
            >
              <input
                type="text"
                value={form.id}
                onChange={(e) => {
                  setSlugTouched(true);
                  update("id", slugifyWhileTyping(e.target.value));
                }}
                // Al salir del campo se recorta el guion que `onChange` deja
                // colgando mientras se escribe.
                onBlur={() => update("id", slugify(form.id))}
                // Cambiar el id de un post ya publicado rompería su enlace y
                // dejaría un 404 en cualquier sitio donde estuviera compartido.
                disabled={!creating}
                className={`${inputClass} disabled:opacity-60`}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                /foro/{form.id || "…"}
                {!creating && " · no se puede cambiar"}
              </p>
            </FormField>

            {showStatus && (
              <FormField label="Estado">
                <select
                  value={form.status}
                  onChange={(e) =>
                    update("status", e.target.value as Post["status"])
                  }
                  className={inputClass}
                >
                  <option value="draft">Borrador</option>
                  <option value="published">Publicado</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Un borrador se guarda pero no sale en el sitio.
                </p>
              </FormField>
            )}

            <div className="sm:col-span-2">
              <FormField label="Resumen">
                <textarea
                  value={form.excerpt}
                  onChange={(e) => update("excerpt", e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Se ve en la tarjeta del listado y al compartir el enlace. Si lo dejas vacío se toma el primer párrafo."
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Portada
          </h3>
          <div className="flex flex-wrap items-start gap-4">
            {form.cover_image_url && (
              <img
                src={form.cover_image_url}
                alt=""
                className="h-24 w-40 rounded-lg bg-gray-100 object-cover dark:bg-gray-700"
              />
            )}
            <div className="min-w-[240px] flex-1">
              <input
                type="url"
                value={form.cover_image_url}
                onChange={(e) => update("cover_image_url", e.target.value)}
                placeholder="https://…"
                className={inputClass}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => coverFileRef.current?.click()}
                  disabled={uploading !== null}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {uploading === "cover" ? "Subiendo…" : "Subir imagen"}
                </button>
                {form.cover_image_url && (
                  <button
                    type="button"
                    onClick={() => update("cover_image_url", "")}
                    className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>
          <input
            ref={coverFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Se limpia el input para que elegir el MISMO archivo otra vez
              // vuelva a disparar el evento.
              e.target.value = "";
              if (file) upload(file, "cover");
            }}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Contenido (markdown)
            </h3>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
              {(["write", "preview"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${
                    tab === value
                      ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {value === "write" ? "Escribir" : "Vista previa"}
                </button>
              ))}
            </div>
          </div>

          {tab === "write" ? (
            <>
              <div className="mb-2 flex flex-wrap gap-1">
                {TOOLS.map((tool) => (
                  <button
                    key={tool.label}
                    type="button"
                    title={tool.title}
                    onClick={() => applyTool(tool)}
                    className="rounded border border-gray-300 px-2 py-1 font-mono text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {tool.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => bodyFileRef.current?.click()}
                  disabled={uploading !== null}
                  title="Insertar imagen"
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {uploading === "body" ? "Subiendo…" : "🖼 Imagen"}
                </button>
              </div>
              <textarea
                ref={bodyRef}
                required
                value={form.body}
                onChange={(e) => update("body", e.target.value)}
                rows={20}
                placeholder={"# Título\n\nEscribe aquí en markdown."}
                className={`${inputClass} font-mono`}
              />
              <input
                ref={bodyFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload(file, "body");
                }}
              />
            </>
          ) : "html" in preview ? (
            // Seguro porque `renderMarkdownPreview` valida ANTES de renderizar
            // y se niega a devolver HTML si el cuerpo lleva etiquetas en crudo
            // o enlaces con esquemas ejecutables. Importa especialmente al
            // revisar la propuesta de alguien de fuera: ese texto se pinta
            // dentro de tu sesión de admin. Ver src/lib/markdown.ts.
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          ) : null}

          {bodyError && (
            <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {bodyError}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Etiquetas
          </h3>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Escribe y pulsa Enter"
            className={inputClass}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "tags",
                      form.tags.filter((t) => t !== tag)
                    )
                  }
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || bodyError !== null}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : (submitLabel ??
                (form.status === "published"
                  ? "Publicar"
                  : "Guardar borrador"))}
          </button>
        </div>
      </form>
    </div>
  );
}
