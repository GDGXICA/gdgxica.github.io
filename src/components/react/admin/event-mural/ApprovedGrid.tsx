import { useMemo, useState } from "react";
import type { MuralPhoto } from "@/lib/mural";

interface Props {
  photos: MuralPhoto[];
  busyId: string | null;
  onTakedown: (
    id: string,
    reason: "owner_request" | "moderation" | "other",
    note: string
  ) => void;
}

export function ApprovedGrid({ photos, busyId, onTakedown }: Props) {
  const [search, setSearch] = useState("");

  const ordered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? photos.filter((p) => p.alias.toLowerCase().includes(term))
      : photos;
    return [...matches].sort((a, b) => {
      const aReq = a.removalRequestedAt ? 0 : 1;
      const bReq = b.removalRequestedAt ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return (b.approvedAt?.seconds ?? 0) - (a.approvedAt?.seconds ?? 0);
    });
  }, [photos, search]);

  function takedown(photo: MuralPhoto) {
    const requested = Boolean(photo.removalRequestedAt);
    const note = window.prompt(
      requested
        ? "Retirar esta foto a petición de quien la subió.\n\nMotivo para el registro:"
        : "Retirar esta foto del mural.\n\nMotivo (obligatorio, queda auditado):",
      requested ? "Retirada a petición de quien la subió" : ""
    );
    if (note === null) return;
    if (!note.trim()) {
      window.alert("Retirar una foto necesita un motivo.");
      return;
    }
    onTakedown(
      photo.id,
      requested ? "owner_request" : "moderation",
      note.trim()
    );
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Todavía no hay ninguna foto en el mural.
      </div>
    );
  }

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre…"
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm sm:max-w-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {ordered.map((photo) => {
          const requested = Boolean(photo.removalRequestedAt);
          return (
            <div
              key={photo.id}
              className={`overflow-hidden rounded-lg border bg-white dark:bg-gray-900 ${
                requested
                  ? "border-red-500 ring-2 ring-red-500"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {photo.downloadUrl && (
                <img
                  src={photo.downloadUrl}
                  alt={
                    photo.alias
                      ? `Foto de ${photo.alias}`
                      : "Foto publicada en el mural"
                  }
                  className="aspect-square w-full bg-gray-100 object-cover dark:bg-gray-800"
                  loading="lazy"
                />
              )}
              <div className="p-2">
                {requested && (
                  <p className="mb-1 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                    Pidió que la quiten
                    {photo.removalRequestNote
                      ? `: “${photo.removalRequestNote}”`
                      : ""}
                  </p>
                )}
                <p className="truncate text-xs text-gray-700 dark:text-gray-300">
                  {photo.alias || "Sin nombre"}
                </p>
                <button
                  type="button"
                  disabled={busyId === photo.id}
                  onClick={() => takedown(photo)}
                  className={`mt-2 w-full rounded px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                    requested
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-gray-700 hover:bg-gray-800"
                  }`}
                >
                  Retirar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
