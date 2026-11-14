import type { CSSProperties } from "react";
import { MURAL_STATUS_LABELS, type MuralPhoto } from "@/lib/mural";

interface Props {
  mine: MuralPhoto[];
  busyId: string | null;
  onRequestRemoval: (photo: MuralPhoto) => void;
}

// A status is a coded dot, the way the rest of the site marks categories.
const STATUS_DOTS: Record<string, string> = {
  pending: "var(--g-yellow)",
  approved: "var(--g-green)",
  rejected: "var(--g-red)",
  removed: "var(--muted)",
};

const FALLBACK_DOT = "var(--muted)";

export function MyPhotosList({ mine, busyId, onRequestRemoval }: Props) {
  if (mine.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] text-(--ink)">
        Tus fotos
      </h2>
      <ul className="divide-y divide-(--line) border-y border-(--line)">
        {mine.map((photo) => {
          const requested = Boolean(photo.removalRequestedAt);
          const gone =
            photo.status === "rejected" || photo.status === "removed";
          return (
            <li key={photo.id} className="flex gap-4 py-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-(--radius-sm) bg-(--surface-2)">
                {photo.downloadUrl ? (
                  <img
                    src={photo.downloadUrl}
                    alt="Foto que subiste al mural"
                    className={`h-full w-full object-cover ${gone ? "opacity-50" : ""}`}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-center text-xs text-(--muted)">
                    Sin imagen
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col items-start">
                <span
                  className="inline-flex min-h-7 items-center gap-2 rounded-(--radius-sm) border border-(--line-strong) px-2.5 font-mono text-[0.8125rem] text-(--ink)"
                  style={
                    {
                      "--dot": STATUS_DOTS[photo.status] ?? FALLBACK_DOT,
                    } as CSSProperties
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-(--dot)"
                    aria-hidden="true"
                  />
                  {MURAL_STATUS_LABELS[photo.status] ?? photo.status}
                </span>

                {photo.status === "rejected" && photo.reviewNote && (
                  <p className="mt-2 text-[0.9375rem] leading-6 text-(--muted)">
                    {photo.reviewNote}
                  </p>
                )}

                {requested && !gone && (
                  <p className="mt-2 text-[0.9375rem] leading-6 text-(--muted)">
                    Retirada solicitada. Alguien de la organización la quitará.
                  </p>
                )}

                {!gone && !requested && (
                  <button
                    type="button"
                    disabled={busyId === photo.id}
                    onClick={() => onRequestRemoval(photo)}
                    className="n-link mt-1 inline-flex min-h-11 items-center text-[0.9375rem] disabled:opacity-50"
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
