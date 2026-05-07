import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { AttachTemplateModal } from "./AttachTemplateModal";
import { BingoWinnersPanel } from "./BingoWinnersPanel";
import { InstanceCard } from "./InstanceCard";
import { WordModerationPanel } from "./WordModerationPanel";
import type { InstanceState, MinigameInstance } from "./types";

interface Props {
  // Optional injection point so unit tests can avoid touching window.location.
  initialSlug?: string;
}

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("slug");
}

export function EventMinigameManager({ initialSlug }: Props) {
  const [slug] = useState<string | null>(initialSlug ?? slugFromUrl());
  const [instances, setInstances] = useState<MinigameInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [moderationFor, setModerationFor] = useState<MinigameInstance | null>(
    null
  );

  const reload = useCallback(async () => {
    if (!slug) return;
    const res = await api.listEventMinigames(slug);
    if (res.success && Array.isArray(res.data)) {
      setInstances(res.data as MinigameInstance[]);
      setError(null);
    } else {
      setError(res.error || "Error al cargar instancias");
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const attachedTemplateIds = useMemo(
    () => new Set(instances.map((i) => i.templateId)),
    [instances]
  );

  function buildJoinUrl(): string | null {
    if (!slug) return null;
    return `https://gdgica.com/eventos/${encodeURIComponent(slug)}?play=1`;
  }

  function openProjector() {
    if (!slug || typeof window === "undefined") return;
    window.open(`/eventos/${encodeURIComponent(slug)}/proyector`, "_blank");
  }

  async function copyJoinUrl() {
    const url = buildJoinUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: "URL copiada al portapapeles", type: "success" });
    } catch {
      setToast({ message: "No se pudo copiar la URL", type: "error" });
    }
  }

  async function handleSetState(id: string, state: InstanceState) {
    if (!slug) return;
    setBusyId(id);
    const res = await api.setMinigameState(slug, id, state);
    if (res.success) {
      setToast({ message: `Estado: ${state}`, type: "success" });
      await reload();
    } else {
      setToast({
        message: res.error || "Error al cambiar estado",
        type: "error",
      });
    }
    setBusyId(null);
  }

  async function handleAdvanceQuiz(id: string) {
    if (!slug) return;
    setBusyId(id);
    const res = await api.advanceQuizQuestion(slug, id);
    if (res.success) {
      setToast({ message: "Pregunta avanzada", type: "success" });
      await reload();
    } else {
      setToast({
        message: res.error || "Error al avanzar pregunta",
        type: "error",
      });
    }
    setBusyId(null);
  }

  async function handleDelete(id: string) {
    if (!slug) return;
    setBusyId(id);
    const res = await api.removeMinigameFromEvent(slug, id);
    if (res.success) {
      setToast({ message: "Instancia eliminada", type: "success" });
      setInstances((prev) => prev.filter((i) => i.id !== id));
    } else {
      setToast({ message: res.error || "Error al eliminar", type: "error" });
    }
    setBusyId(null);
  }

  if (!slug) {
    return (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
        Falta el parámetro <code>?slug=</code> en la URL.
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

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <a
            href="/admin/eventos"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            ← Volver a eventos
          </a>
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            Mini-juegos · <span className="font-mono">{slug}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openProjector}
            className="rounded-lg border border-purple-500 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 dark:border-purple-400 dark:text-purple-300 dark:hover:bg-purple-900/20"
          >
            📺 Abrir proyector
          </button>
          <button
            type="button"
            onClick={copyJoinUrl}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            📋 Copiar URL de unión
          </button>
          <button
            type="button"
            onClick={() => setAttaching(true)}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Adjuntar plantilla
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && instances.length === 0 && (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          Aún no hay mini-juegos en este evento. Adjunta una plantilla para
          empezar.
        </p>
      )}

      {!loading && instances.length > 0 && (
        <div className="space-y-3">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              busy={busyId === inst.id}
              onSetState={(state) => handleSetState(inst.id, state)}
              onAdvanceQuiz={() => handleAdvanceQuiz(inst.id)}
              onDelete={() => handleDelete(inst.id)}
              onOpenModeration={
                inst.type === "wordcloud" || inst.type === "bingo"
                  ? () => setModerationFor(inst)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {moderationFor && moderationFor.type === "wordcloud" && (
        <WordModerationPanel
          slug={slug!}
          instanceId={moderationFor.id}
          title={moderationFor.title}
          onClose={() => setModerationFor(null)}
        />
      )}
      {moderationFor && moderationFor.type === "bingo" && (
        <BingoWinnersPanel
          slug={slug!}
          instanceId={moderationFor.id}
          title={moderationFor.title}
          onClose={() => setModerationFor(null)}
        />
      )}

      {attaching && (
        <AttachTemplateModal
          alreadyAttachedTemplateIds={attachedTemplateIds}
          onCancel={() => setAttaching(false)}
          onError={(message) => setToast({ message, type: "error" })}
          onAttached={async () => {
            setAttaching(false);
            setToast({ message: "Plantilla adjuntada", type: "success" });
            await reload();
          }}
          attach={async (templateId) => {
            const res = await api.attachMinigameToEvent(slug, {
              templateId,
              order: instances.length,
            });
            return res;
          }}
        />
      )}
    </div>
  );
}
