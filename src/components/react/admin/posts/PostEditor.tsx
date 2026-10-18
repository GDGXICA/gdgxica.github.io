import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";
import { api, type Post } from "@/lib/api";
import { renderMarkdownPreview } from "@/lib/markdown";
import { FormField } from "../ui/FormField";
import {
  ArrowIcon,
  ChartRule,
  CloseIcon,
  CornerNodes,
  ErrorState,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { prepareImage } from "@/lib/prepareImage";
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

function ToolIcon({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

const ImageIcon = () => (
  <ToolIcon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 16l-5-5-8 8" />
  </ToolIcon>
);

/**
 * Lo que hace cada botón de la barra: el texto que va antes y después de lo
 * seleccionado, y lo que se escribe si no hay nada seleccionado.
 */
const TOOLS: {
  icon: ReactNode;
  title: string;
  before: string;
  after: string;
  placeholder: string;
  /** Los de bloque van al principio de la línea, no alrededor. */
  block?: boolean;
}[] = [
  {
    icon: (
      <ToolIcon>
        <path d="M4 6v12M12 6v12M4 12h8M15.5 12.5a2 2 0 1 1 3.4 1.4L15.5 18h4" />
      </ToolIcon>
    ),
    title: "Título de sección",
    before: "## ",
    after: "",
    placeholder: "Título",
    block: true,
  },
  {
    icon: (
      <ToolIcon strokeWidth="2">
        <path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z" />
      </ToolIcon>
    ),
    title: "Negrita",
    before: "**",
    after: "**",
    placeholder: "texto",
  },
  {
    icon: (
      <ToolIcon>
        <path d="M11 5h7M6 19h7M14.5 5l-5 14" />
      </ToolIcon>
    ),
    title: "Cursiva",
    before: "_",
    after: "_",
    placeholder: "texto",
  },
  {
    icon: (
      <ToolIcon>
        <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </ToolIcon>
    ),
    title: "Enlace",
    before: "[",
    after: "](https://)",
    placeholder: "texto del enlace",
  },
  {
    icon: (
      <ToolIcon>
        <path d="M10 6h10M10 12h10M10 18h10" />
        <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
      </ToolIcon>
    ),
    title: "Lista",
    before: "- ",
    after: "",
    placeholder: "elemento",
    block: true,
  },
  {
    icon: (
      <ToolIcon>
        <path d="M5 5v14M9.5 8H19M9.5 12H19M9.5 16H15" />
      </ToolIcon>
    ),
    title: "Cita",
    before: "> ",
    after: "",
    placeholder: "cita",
    block: true,
  },
  {
    icon: (
      <ToolIcon>
        <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />
      </ToolIcon>
    ),
    title: "Bloque de código",
    before: "```\n",
    after: "\n```",
    placeholder: "código",
  },
];

const toolClass =
  "text-atlas-mist hover:bg-atlas-deep hover:text-atlas-dust inline-flex size-9 items-center justify-center rounded-md transition-colors disabled:opacity-50";

const proseClass = [
  "prose prose-sm prose-invert max-w-none",
  "[--tw-prose-invert-body:var(--color-atlas-mist)]",
  "[--tw-prose-invert-headings:var(--color-atlas-dust)]",
  "[--tw-prose-invert-lead:var(--color-atlas-mist)]",
  "[--tw-prose-invert-links:var(--color-atlas-glow)]",
  "[--tw-prose-invert-bold:var(--color-atlas-dust)]",
  "[--tw-prose-invert-counters:var(--color-atlas-fog)]",
  "[--tw-prose-invert-bullets:var(--color-atlas-fog)]",
  "[--tw-prose-invert-hr:var(--color-atlas-line)]",
  "[--tw-prose-invert-quotes:var(--color-atlas-mist)]",
  "[--tw-prose-invert-quote-borders:var(--color-atlas-line)]",
  "[--tw-prose-invert-captions:var(--color-atlas-fog)]",
  "[--tw-prose-invert-code:var(--color-atlas-glow)]",
  "[--tw-prose-invert-pre-code:var(--color-atlas-dust)]",
  "[--tw-prose-invert-pre-bg:var(--color-atlas-deep)]",
  "[--tw-prose-invert-th-borders:var(--color-atlas-line)]",
  "[--tw-prose-invert-td-borders:var(--color-atlas-line)]",
  "prose-headings:font-semibold prose-headings:tracking-tight",
  "prose-a:underline-offset-4",
  "prose-pre:rounded-xs prose-pre:border prose-pre:border-atlas-line",
  "prose-img:rounded-xs",
].join(" ");

function EditorSection({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-4 flex items-end gap-4">
        <h3
          id={id}
          className="atlas-name text-atlas-dust text-[1.375rem] leading-none"
        >
          {title}
        </h3>
        <ChartRule className="mb-1 flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

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
  const ids = useId();

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

  /**
   * Mete markdown en la posición del cursor del cuerpo.
   *
   * El cuerpo se toma del actualizador (`prev`), no de `form.body`: subir una
   * imagen tarda, y quien escribe sigue escribiendo mientras tanto. Leyendo el
   * cuerpo del render en que se eligió el archivo, la inserción devolvía el
   * texto al estado que tenía entonces y se perdía lo tecleado — y como los
   * offsets del cursor sí eran los de ahora, el markdown podía acabar cosido a
   * mitad de una palabra.
   */
  function insert(before: string, after: string, placeholder: string) {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    setForm((prev) => {
      const selected = prev.body.slice(start, end) || placeholder;
      return {
        ...prev,
        body:
          prev.body.slice(0, start) +
          before +
          selected +
          after +
          prev.body.slice(end),
      };
    });

    const selectedLength = (textarea.value.slice(start, end) || placeholder)
      .length;

    // El cursor queda envolviendo lo insertado, para poder seguir escribiendo
    // encima sin ir a buscarlo con el ratón.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedLength
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
    setForm((prev) => {
      const lineStart = prev.body.lastIndexOf("\n", start - 1) + 1;
      return {
        ...prev,
        body:
          prev.body.slice(0, lineStart) +
          tool.before +
          prev.body.slice(lineStart),
      };
    });
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

  const missing = [
    !form.title.trim() && "título",
    !form.id && "identificador",
    !form.body.trim() && "contenido",
  ].filter(Boolean) as string[];
  const ready = missing.length === 0 && bodyError === null;

  return (
    <div className="mx-auto max-w-6xl">
      <button
        type="button"
        onClick={onCancel}
        className={`${buttonClass.quiet} mb-4 -ml-2`}
      >
        <ArrowIcon className="size-4 rotate-180" />
        Volver
      </button>
      <h2 className="atlas-name text-atlas-dust mb-8 text-[1.75rem] leading-tight break-words">
        {heading ?? (creating ? "Nuevo post" : `Editar: ${form.title}`)}
      </h2>

      <form
        onSubmit={handleSubmit}
        className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div className="min-w-0 space-y-10">
          <EditorSection id={`${ids}-datos`} title="Datos">
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

              <div className="sm:col-span-2">
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
                    className={inputClass}
                  />
                </FormField>
                <p className="text-atlas-fog mt-1.5 text-xs">
                  {creating
                    ? "Se genera del título; puedes cambiarlo antes de guardar."
                    : "No se puede cambiar: rompería los enlaces ya compartidos."}
                </p>
              </div>

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
          </EditorSection>

          <EditorSection id={`${ids}-portada`} title="Portada">
            <div className="flex flex-wrap items-start gap-4">
              {form.cover_image_url && (
                <img
                  src={form.cover_image_url}
                  alt=""
                  className="border-atlas-line bg-atlas-deep h-24 w-40 rounded-xs border object-cover"
                />
              )}
              <div className="min-w-[min(240px,100%)] flex-1">
                <FormField label="Dirección de la imagen">
                  <input
                    type="url"
                    value={form.cover_image_url}
                    onChange={(e) => update("cover_image_url", e.target.value)}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </FormField>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => coverFileRef.current?.click()}
                    disabled={uploading !== null}
                    className={buttonClass.secondary}
                  >
                    {uploading === "cover" ? "Subiendo…" : "Subir imagen"}
                  </button>
                  {form.cover_image_url && (
                    <button
                      type="button"
                      onClick={() => update("cover_image_url", "")}
                      className="text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors"
                    >
                      Quitar portada
                    </button>
                  )}
                  <span className="text-atlas-fog text-xs">
                    JPG, PNG o WebP.
                  </span>
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
          </EditorSection>

          <EditorSection
            id={`${ids}-contenido`}
            title="Contenido"
            action={
              <div className="flex gap-4">
                {(["write", "preview"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tab === value}
                    onClick={() => setTab(value)}
                    className={`-mb-1 border-b-2 pb-1 text-sm font-semibold transition-colors ${
                      tab === value
                        ? "border-atlas-star text-atlas-dust"
                        : "text-atlas-mist hover:text-atlas-dust border-transparent"
                    }`}
                  >
                    {value === "write" ? "Escribir" : "Vista previa"}
                  </button>
                ))}
              </div>
            }
          >
            {tab === "write" ? (
              <>
                <div
                  role="toolbar"
                  aria-label="Formato markdown"
                  className="border-atlas-line mb-2 flex flex-wrap items-center gap-0.5 border-b pb-2"
                >
                  {TOOLS.map((tool) => (
                    <button
                      key={tool.title}
                      type="button"
                      title={tool.title}
                      aria-label={tool.title}
                      onClick={() => applyTool(tool)}
                      className={toolClass}
                    >
                      {tool.icon}
                    </button>
                  ))}
                  <span
                    aria-hidden="true"
                    className="bg-atlas-line mx-1 h-5 w-px"
                  />
                  <button
                    type="button"
                    onClick={() => bodyFileRef.current?.click()}
                    disabled={uploading !== null}
                    title="Insertar imagen"
                    className={`${toolClass} w-auto gap-2 px-2.5 text-sm font-semibold`}
                  >
                    <ImageIcon />
                    {uploading === "body" ? "Subiendo…" : "Imagen"}
                  </button>
                </div>
                <textarea
                  ref={bodyRef}
                  required
                  aria-label="Contenido en markdown"
                  value={form.body}
                  onChange={(e) => update("body", e.target.value)}
                  rows={20}
                  placeholder={"# Título\n\nEscribe aquí en markdown."}
                  className={`${inputClass} font-mono leading-relaxed`}
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
              <div className="border-atlas-line min-h-80 rounded-xs border px-5 py-4">
                {/* Seguro porque `renderMarkdownPreview` valida ANTES de renderizar
                    y se niega a devolver HTML si el cuerpo lleva etiquetas en crudo
                    o enlaces con esquemas ejecutables. Importa especialmente al
                    revisar la propuesta de alguien de fuera: ese texto se pinta
                    dentro de tu sesión de admin. Ver src/lib/markdown.ts. */}
                <div
                  className={proseClass}
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              </div>
            ) : (
              <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
                La vista previa vuelve en cuanto el contenido no tenga HTML.
              </p>
            )}

            {bodyError && (
              <div className="mt-3">
                <ErrorState message={bodyError} />
              </div>
            )}
          </EditorSection>

          <EditorSection id={`${ids}-etiquetas`} title="Etiquetas">
            <FormField label="Añadir etiqueta">
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
            </FormField>
            {form.tags.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {form.tags.map((tag) => (
                  <li
                    key={tag}
                    className="border-atlas-line text-atlas-dust inline-flex items-center gap-1 rounded-xs border py-1 pr-1 pl-2.5 text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Quitar la etiqueta ${tag}`}
                      onClick={() =>
                        update(
                          "tags",
                          form.tags.filter((t) => t !== tag)
                        )
                      }
                      className="text-atlas-fog hover:text-atlas-rose rounded-md p-0.5 transition-colors"
                    >
                      <CloseIcon className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-atlas-fog mt-2 text-xs">
                Sin etiquetas todavía.
              </p>
            )}
          </EditorSection>
        </div>

        <aside
          aria-label="Resumen del post"
          className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
        >
          <CornerNodes />
          <p className="atlas-label text-atlas-glow">Resumen del post</p>
          <p className="atlas-name text-atlas-dust mt-3 text-lg leading-snug break-words">
            {form.title.trim() || "Sin título todavía"}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-atlas-fog">Dirección</dt>
              <dd className="text-atlas-dust mt-0.5 break-all">
                /foro/{form.id || "…"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Portada</dt>
              <dd className="text-atlas-dust">
                {form.cover_image_url ? "Con imagen" : "Sin imagen"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Etiquetas</dt>
              <dd className="text-atlas-dust tabular-nums">
                {form.tags.length}
              </dd>
            </div>
          </dl>

          {showStatus && (
            <div className="border-atlas-line mt-4 border-t pt-4">
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
              </FormField>
              <p className="text-atlas-fog mt-1.5 text-xs leading-snug">
                {form.status === "published"
                  ? "Sale en el sitio cuando termine la reconstrucción, en unos minutos."
                  : "Un borrador se guarda pero no sale en el sitio."}
              </p>
            </div>
          )}

          {!ready && (
            <p className="text-atlas-mist mt-4 text-sm">
              {bodyError
                ? "Corrige el contenido antes de guardar."
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
              : (submitLabel ??
                (form.status === "published"
                  ? "Publicar"
                  : "Guardar borrador"))}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`${buttonClass.secondary} mt-2 w-full`}
          >
            Cancelar
          </button>
        </aside>
      </form>
    </div>
  );
}
