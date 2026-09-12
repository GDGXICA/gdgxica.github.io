import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  type Template,
} from "../minigame-templates/types";

interface Props {
  alreadyAttachedTemplateIds: Set<string>;
  onCancel: () => void;
  onAttached: () => void;
  onError: (message: string) => void;
  attach: (templateId: string) => Promise<{ success: boolean; error?: string }>;
}

export function AttachTemplateModal({
  alreadyAttachedTemplateIds,
  onCancel,
  onAttached,
  onError,
  attach,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // `onError` se lee desde una ref, y NO va en las dependencias del efecto de
  // abajo. Teniéndolo ahí, la garantía de "esto se pide una sola vez" quedaba
  // en manos de quien renderiza el modal: bastaba con pasar una flecha nueva
  // en cada render para que un fallo se realimentara —onError → toast →
  // render del padre → nueva identidad → refetch— a ~2.5 req/s contra la API.
  // El padre además la memoiza, pero la garantía tiene que vivir aquí, junto
  // al efecto, y no depender de que ningún llamador futuro se acuerde.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.listMinigameTemplates();
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setTemplates(res.data as Template[]);
      } else {
        const message = res.error || "Error al cargar plantillas";
        // Se guarda además de avisar al padre. El toast se desvanece a los 5
        // segundos y, sin esto, lo único que quedaba en pantalla era el
        // estado vacío: «No hay plantillas disponibles, crea una en
        // /admin/minigame-templates» — que le dice a alguien que acaba de
        // recibir un 403 que no existen plantillas, y lo manda a una página
        // para la que probablemente tampoco tiene permiso.
        setLoadError(message);
        onErrorRef.current(message);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const available = useMemo(
    () =>
      templates.filter((t) => t.id && !alreadyAttachedTemplateIds.has(t.id)),
    [templates, alreadyAttachedTemplateIds]
  );

  async function handleAttach(templateId: string) {
    setSubmitting(templateId);
    const res = await attach(templateId);
    if (res.success) {
      onAttached();
    } else {
      onError(res.error || "Error al adjuntar plantilla");
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adjuntar plantilla"
        className="relative z-10 max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Adjuntar plantilla
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {loading && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Cargando plantillas...
            </p>
          )}
          {!loading && loadError && (
            <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">
              {loadError}
            </p>
          )}
          {!loading && !loadError && available.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No hay plantillas disponibles. Crea una en{" "}
              <a
                href="/admin/minigame-templates"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                /admin/minigame-templates
              </a>
              .
            </p>
          )}
          {!loading && available.length > 0 && (
            <ul className="space-y-2">
              {available.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.type]}`}
                      >
                        {TYPE_LABELS[t.type]}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {t.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAttach(t.id!)}
                    disabled={submitting !== null}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting === t.id ? "..." : "Adjuntar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
