import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Post, type PostSummary } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";
import { PostEditor } from "./PostEditor";

const STATUS: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Borrador",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  published: {
    label: "Publicado",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
      setError(res.error || "No se pudieron cargar los posts");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Más recientes primero, como en el sitio.
  const ordered = useMemo(
    () =>
      [...posts].sort(
        (a, b) =>
          Date.parse(b.published_at || "") - Date.parse(a.published_at || "")
      ),
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
        message: res.error || "No se pudo abrir el post",
        type: "error",
      });
      return;
    }
    setEditor({ post: res.data });
  }

  async function handleDelete(post: PostSummary) {
    if (
      !confirm(
        `Eliminar "${post.title}"? El post desaparece del sitio y del repositorio de datos.`
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
      setToast({ message: res.error || "Error", type: "error" });
    }
  }

  if (editor) {
    return (
      <>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
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
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Publicaciones del foro. Se escriben en markdown y salen en{" "}
          <a
            href="/foro"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            gdgica.com/foro
          </a>{" "}
          cuando se publican.
        </p>
        {canWrite && (
          <button
            onClick={() => setEditor({ post: null })}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nuevo post
          </button>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          Todavía no hay posts.
        </p>
      ) : (
        <>
          {/* Escritorio */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Post
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Publicado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ordered.map((post) => {
                  const state = STATUS[post.status] ?? STATUS.draft;
                  return (
                    <tr
                      key={post.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {post.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {post.author_name || "—"} · /foro/{post.id}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${state.className}`}
                        >
                          {state.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(post.published_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {post.status === "published" && (
                            <a
                              href={`/foro/${post.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                              Ver
                            </a>
                          )}
                          {canWrite && (
                            <button
                              onClick={() => openEditor(post.id)}
                              disabled={opening === post.id}
                              className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                            >
                              {opening === post.id ? "..." : "Editar"}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(post)}
                              disabled={deleting === post.id}
                              className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              {deleting === post.id ? "..." : "Eliminar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil */}
          <div className="space-y-3 md:hidden">
            {ordered.map((post) => {
              const state = STATUS[post.status] ?? STATUS.draft;
              return (
                <div
                  key={post.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {post.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(post.published_at)} · /foro/{post.id}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${state.className}`}
                    >
                      {state.label}
                    </span>
                  </div>
                  <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                    {canWrite && (
                      <button
                        onClick={() => openEditor(post.id)}
                        disabled={opening === post.id}
                        className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      >
                        {opening === post.id ? "..." : "Editar"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(post)}
                        disabled={deleting === post.id}
                        className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {deleting === post.id ? "..." : "Eliminar"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
