import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EventPicker } from "../ui/EventPicker";
import { Toast } from "../ui/Toast";
import { ApprovedGrid } from "./ApprovedGrid";
import { ModerationQueue } from "./ModerationQueue";
import { MuralSettingsPanel } from "./MuralSettingsPanel";
import { useMuralPhotos } from "./useMuralPhotos";
import type { MuralState } from "@/lib/mural";

interface Props {
  initialSlug?: string;
}

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("slug");
}

type Tab = "queue" | "approved" | "settings";

export function EventMuralManager({ initialSlug }: Props) {
  const [slug] = useState<string | null>(initialSlug ?? slugFromUrl());
  const [tab, setTab] = useState<Tab>("queue");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const {
    pending,
    approved,
    removalRequested,
    queueFull,
    settings,
    loading,
    error,
  } = useMuralPhotos(slug);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const waiting = pending.length + removalRequested.length;
    const base = "Mural · GDG Ica";
    document.title = waiting > 0 ? `(${waiting}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [pending.length, removalRequested.length]);

  const review = useCallback(
    async (id: string, decision: "approve" | "reject", note: string) => {
      if (!slug) return;
      setBusyId(id);
      const res = await api.reviewMuralPhoto(slug, id, decision, note);
      setBusyId(null);
      if (!res.success) {
        setToast({ message: res.error || "No se pudo revisar", type: "error" });
        return;
      }

      setToast({
        message: decision === "approve" ? "Aprobada" : "Rechazada",
        type: "success",
      });
    },
    [slug]
  );

  const takedown = useCallback(
    async (
      id: string,
      reason: "owner_request" | "moderation" | "other",
      note: string
    ) => {
      if (!slug) return;
      setBusyId(id);
      const res = await api.takedownMuralPhoto(slug, id, reason, note);
      setBusyId(null);
      setToast(
        res.success
          ? { message: "Retirada del mural", type: "success" }
          : { message: res.error || "No se pudo retirar", type: "error" }
      );
    },
    [slug]
  );

  const saveSettings = useCallback(
    async (next: {
      state: MuralState;
      maxPerUid: number;
      maxTotal: number;
      headline: string;
    }) => {
      if (!slug) return;
      setSaving(true);
      const res = await api.setMuralSettings(slug, next);
      setSaving(false);
      setToast(
        res.success
          ? { message: "Ajustes guardados", type: "success" }
          : { message: res.error || "No se pudo guardar", type: "error" }
      );
    },
    [slug]
  );

  if (!slug) {
    return (
      <EventPicker basePath="/admin/events/mural" title="Mural de fotos" />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
        {error}
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "queue", label: "Por revisar", badge: pending.length },
    {
      id: "approved",
      label: "En el mural",
      badge: removalRequested.length || undefined,
    },
    { id: "settings", label: "Ajustes" },
  ];

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Mural de fotos
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {slug} ·{" "}
          {settings.state === "open"
            ? "abierto a subidas"
            : settings.state === "paused"
              ? "en pausa"
              : "cerrado"}
        </p>
      </div>

      <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  t.id === "approved"
                    ? "bg-red-600 text-white"
                    : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                }`}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "queue" && (
        <ModerationQueue
          photos={pending}
          busyId={busyId}
          queueFull={queueFull}
          onReview={review}
        />
      )}
      {tab === "approved" && (
        <ApprovedGrid photos={approved} busyId={busyId} onTakedown={takedown} />
      )}
      {tab === "settings" && (
        <MuralSettingsPanel
          settings={settings}
          saving={saving}
          onSave={saveSettings}
        />
      )}
    </div>
  );
}
