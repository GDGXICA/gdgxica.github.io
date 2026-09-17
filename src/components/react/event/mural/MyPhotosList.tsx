import { MURAL_STATUS_LABELS, type MuralPhoto } from "@/lib/mural";

interface Props {
  mine: MuralPhoto[];
  busyId: string | null;
  onRequestRemoval: (photo: MuralPhoto) => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  removed: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const FALLBACK_STYLE = "bg-gray-100 text-gray-700";

export function MyPhotosList({ mine, busyId, onRequestRemoval }: Props) {
  if (mine.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Tus fotos</h2>
      <ul className="space-y-3">
        {mine.map((photo) => {
          const requested = Boolean(photo.removalRequestedAt);
          const gone =
            photo.status === "rejected" || photo.status === "removed";
          return (
            <li
              key={photo.id}
              className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                {photo.downloadUrl ? (
                  <img
                    src={photo.downloadUrl}
                    alt="Foto que subiste al mural"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                    Sin imagen
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[photo.status] ?? FALLBACK_STYLE
                  }`}
                >
                  {MURAL_STATUS_LABELS[photo.status] ?? photo.status}
                </span>

                {photo.status === "rejected" && photo.reviewNote && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {photo.reviewNote}
                  </p>
                )}

                {requested && !gone && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Retirada solicitada. Alguien de la organización la quitará.
                  </p>
                )}

                {!gone && !requested && (
                  <button
                    type="button"
                    disabled={busyId === photo.id}
                    onClick={() => onRequestRemoval(photo)}
                    className="mt-2 text-sm font-medium text-red-600 underline disabled:opacity-50"
                  >
                    Pedir que la quiten
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
