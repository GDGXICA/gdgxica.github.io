import { useEffect, useMemo, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";

interface Props {
  photos: MuralPhoto[];
  busyId: string | null;
  queueFull?: boolean;
  onReview: (id: string, decision: "approve" | "reject", note: string) => void;
}

function timeAgo(seconds: number | undefined): string {
  if (!seconds) return "";
  const mins = Math.floor((Date.now() / 1000 - seconds) / 60);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.floor(mins / 60)} h`;
}

function wasRemovalRequested(photo: MuralPhoto): boolean {
  return (
    photo.removalRequestedAt !== null && photo.removalRequestedAt !== undefined
  );
}

export function ModerationQueue({
  photos,
  busyId,
  queueFull = false,
  onReview,
}: Props) {
  const [focus, setFocus] = useState(0);

  const ordered = useMemo(() => {
    return [...photos].sort((a, b) => {
      const aReq = wasRemovalRequested(a) ? 0 : 1;
      const bReq = wasRemovalRequested(b) ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0);
    });
  }, [photos]);

  useEffect(() => {
    setFocus((f) => Math.min(f, Math.max(0, ordered.length - 1)));
  }, [ordered.length]);

  function reject(photo: MuralPhoto) {
    const note = window.prompt(
      "¿Por qué se rechaza? Lo verá quien la subió.\n\n" +
        "Ojo: la imagen se borra y no se puede recuperar."
    );
    if (note === null) return;
    if (!note.trim()) {
      window.alert("Un rechazo necesita un motivo.");
      return;
    }
    onReview(photo.id, "reject", note.trim());
  }

  function approve(photo: MuralPhoto) {
    if (
      wasRemovalRequested(photo) &&
      !window.confirm(
        "Quien subió esta foto pidió que NO se publique.\n\n" +
          "¿Seguro que quieres aprobarla igualmente?"
      )
    ) {
      return;
    }
    onReview(photo.id, "approve", "");
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (ordered.length === 0) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const current = ordered[Math.min(focus, ordered.length - 1)];
      if (!current || busyId) return;

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        approve(current);
      } else if (key === "r") {
        event.preventDefault();
        reject(current);
      } else if (key === "arrowright" || key === "arrowdown") {
        event.preventDefault();
        setFocus((f) => Math.min(f + 1, ordered.length - 1));
      } else if (key === "arrowleft" || key === "arrowup") {
        event.preventDefault();
        setFocus((f) => Math.max(f - 1, 0));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, focus, busyId, onReview]);

  if (ordered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No hay fotos esperando. El mural está al día.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        <kbd className="rounded border px-1">A</kbd> aprueba,{" "}
        <kbd className="rounded border px-1">R</kbd> rechaza,{" "}
        <kbd className="rounded border px-1">←</kbd>{" "}
        <kbd className="rounded border px-1">→</kbd> se mueve.
      </p>

      {queueFull && (
        <p className="mb-3 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Hay más fotos esperando de las que caben aquí. Revisa estas y
          aparecerán las siguientes.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((photo, index) => {
          const requested = wasRemovalRequested(photo);
          return (
            <div
              key={photo.id}
              className={`overflow-hidden rounded-lg border bg-white dark:bg-gray-900 ${
                requested
                  ? "border-red-500 ring-2 ring-red-500"
                  : index === focus
                    ? "border-blue-600 ring-2 ring-blue-600"
                    : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {photo.downloadUrl && (
                <img
                  src={photo.downloadUrl}
                  alt={
                    photo.alias
                      ? `Foto subida por ${photo.alias}`
                      : "Foto subida al mural"
                  }
                  className="aspect-square w-full bg-gray-100 object-cover dark:bg-gray-800"
                  loading="lazy"
                />
              )}
              <div className="p-3">
                {requested && (
                  <p className="mb-2 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                    Pidió que NO se publique
                    {photo.removalRequestNote
                      ? `: “${photo.removalRequestNote}”`
                      : ""}
                  </p>
                )}
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {photo.alias || "Sin nombre"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {timeAgo(photo.createdAt?.seconds)}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === photo.id}
                    onClick={() => approve(photo)}
                    className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={busyId === photo.id}
                    onClick={() => reject(photo)}
                    className="flex-1 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
