import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Post, type PostSummary } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";
import {
  ErrorState,
  HeaderActions,
  LoadingState,
  SectionHeading,
  buttonClass,
} from "../ui/atlas";
import { PostEditor } from "./PostEditor";

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "text-atlas-glow" },
  published: { label: "Publicado", className: "text-atlas-mist" },
};

/** Milisegundos de una fecha ISO; 0 si falta o es ilegible. */
function time(iso: string): number {
  const ms = Date.parse(iso || "");
  return Number.isNaN(ms) ? 0 : ms;
}

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function PostRow({
  post,
  canWrite,
  canDelete,
  opening,
  deleting,
  onEdit,
  onDelete,
}: {
  post: PostSummary;
  canWrite: boolean;
  canDelete: boolean;
  opening: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const state = STATUS[post.status] ?? STATUS.draft;
  const date = formatDate(post.published_at);

  return (
    <li className="border-atlas-line grid grid-cols-1 gap-x-5 gap-y-3 border-b py-5 last:border-b-0 @3xl:grid-cols-[1fr_auto] @3xl:items-center">
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {post.title || post.id}
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className={`atlas-label ${state.className}`}>
            {state.label}
          </span>
          <span className="text-atlas-fog" aria-hidden="true">
            ·
          </span>
          {date ? (
            <time dateTime={post.published_at} className="text-atlas-mist">
              {date}
            </time>
          ) : (
            <span className="text-atlas-mist">Sin fecha</span>
          )}
          {post.author_name && (
            <>
              <span className="text-atlas-fog" aria-hidden="true">
                ·
              </span>
              <span className="text-atlas-mist">{post.author_name}</span>
            </>
          )}
        </p>
        <p className="text-atlas-fog mt-0.5 truncate text-xs">
          /foro/{post.id}
        </p>
      </div>
      {(canWrite || canDelete || post.status === "published") && (
        <div className="flex flex-wrap items-center gap-2 @3xl:justify-end">
          {canWrite && (
            <button
              type="button"
              onClick={onEdit}
              disabled={opening}
              className={buttonClass.secondary}
            >
              {opening ? "Abriendo…" : "Editar"}
            </button>
          )}
          {post.status === "published" && (
            <a
              href={`/foro/${post.id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonClass.quiet}
            >
              Ver en el sitio
            </a>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function PostList() {
  const { can } = useAuth();
  const canWrite = can("posts:write");
  const canDelete = can("posts:delete");

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // `null` = no se está editando nada. `{ post: null }` = post nuevo.
  const [editor, setEditor] = useState<{ post: Post | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.listPosts();
    if (res.success && res.data) {
      setPosts(res.data);
      setError(null);
    } else {
      setError(
        res.error ||
          "No se pudieron cargar los posts. Suele ser la conexión con el repositorio de datos."
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Más recientes primero, como en el sitio.
  const ordered = useMemo(
    () =>
      // Con NaN en el comparador —una fecha ausente— el orden de toda la lista
      // queda a merced de la implementación de sort, no solo el de esa fila.
      [...posts].sort((a, b) => time(b.published_at) - time(a.published_at)),
    [posts]
  );

  /**
   * El índice no trae el cuerpo, así que editar necesita una segunda llamada.
   * Se pide al abrir y no al cargar la lista: traer el markdown de todos los
   * posts para editar uno sería pagar el foro entero en cada visita.
   */
  async function openEditor(id: string) {
    setOpening(id);
    const res = await api.getPost(id);
    setOpening(null);
    if (!res.success || !res.data) {
      setToast({
        message:
          res.error ||
          "No se pudo abrir el post. Inténtalo de nuevo en un rato.",
        type: "error",
      });
      return;
    }
    setEditor({ post: res.data });
  }

  async function handleDelete(post: PostSummary) {
    if (
      !confirm(
        `¿Eliminar «${post.title || post.id}»? El post desaparece del sitio y del repositorio de datos.`
      )
    )
      return;

    setDeleting(post.id);
    const res = await api.deletePost(post.id);
    setDeleting(null);
    if (res.success) {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setToast({ message: "Post eliminado", type: "success" });
    } else {
      setToast({
        message:
          res.error || "No se pudo eliminar el post. Inténtalo de nuevo.",
        type: "error",
      });
    }
  }

  const toastNode = toast && (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );

  if (editor) {
    return (
      <>
        {toastNode}
        <PostEditor
          initial={editor.post}
          onCancel={() => setEditor(null)}
          onError={(message) => setToast({ message, type: "error" })}
          onSubmit={async (post) => {
            const res = editor.post
              ? await api.updatePost(post.id, post)
              : await api.createPost(post);
            if (!res.success) return res.error || "No se pudo guardar el post";

            setEditor(null);
            setToast({
              message:
                post.status === "published"
                  ? "Post publicado. El sitio se reconstruye en unos minutos."
                  : "Borrador guardado. No sale en el sitio hasta que lo publiques.",
              type: "success",
            });
            load();
            return null;
          }}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {canWrite && (
        <HeaderActions>
          <button
            type="button"
            onClick={() => setEditor({ post: null })}
            className={buttonClass.primary}
          >
            Nuevo post
          </button>
        </HeaderActions>
      )}

      {toastNode}

      <p className="text-atlas-mist mb-8 max-w-[70ch] text-sm leading-relaxed">
        Publicaciones del foro. Se escriben en markdown y salen en{" "}
        <a
          href="/foro"
          className="text-atlas-dust font-semibold underline underline-offset-4"
        >
          gdgica.com/foro
        </a>{" "}
        cuando se publican. Un borrador se guarda en el repositorio de datos,
        que es público, pero no aparece en el sitio.
      </p>

      {loading ? (
        <LoadingState label="Cargando posts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : ordered.length === 0 ? (
        <div className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          <p>Todavía no hay posts.</p>
          {canWrite && (
            <button
              type="button"
              onClick={() => setEditor({ post: null })}
              className="text-atlas-dust mt-1 font-semibold underline underline-offset-4"
            >
              Escribe el primero
            </button>
          )}
        </div>
      ) : (
        <section aria-labelledby="foro-posts" className="@container">
          <SectionHeading
            action={
              <span className="text-atlas-fog text-sm tabular-nums">
                {ordered.length} {ordered.length === 1 ? "post" : "posts"}
              </span>
            }
          >
            <span id="foro-posts">Publicaciones</span>
          </SectionHeading>
          <ul>
            {ordered.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                canWrite={canWrite}
                canDelete={canDelete}
                opening={opening === post.id}
                deleting={deleting === post.id}
                onEdit={() => openEditor(post.id)}
                onDelete={() => handleDelete(post)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
