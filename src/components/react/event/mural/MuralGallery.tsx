import { useEffect, useState } from "react";
import { useMuralGallery } from "./useMuralGallery";

interface Props {
  slug: string;
  eventName: string;
}

function useFancybox(ready: boolean) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!root || !ready) return;
    let unbind: (() => void) | null = null;

    (async () => {
      const [{ Fancybox }] = await Promise.all([
        import("@fancyapps/ui/dist/fancybox/"),
        import("@fancyapps/ui/dist/fancybox/fancybox.css"),
      ]);
      Fancybox.bind(root, "[data-fancybox]", {});
      unbind = () => Fancybox.unbind(root);
    })();

    return () => {
      if (unbind) unbind();
    };
  }, [root, ready]);

  return setRoot;
}

export function MuralGallery({ slug, eventName }: Props) {
  const { photos, loading, loadingMore, hasMore, error, loadMore } =
    useMuralGallery(slug);

  const setRoot = useFancybox(photos.length > 0);

  if (loading && photos.length === 0) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--ochre) border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-(--radius) border border-dashed border-(--line-strong) px-6 py-10 text-center text-(--muted)">
        No pudimos cargar las fotos ahora mismo.
      </p>
    );
  }

  if (photos.length === 0) {
    return (
      <p className="rounded-(--radius) border border-dashed border-(--line-strong) px-6 py-10 text-center text-(--muted)">
        Todavía no hay fotos publicadas de este evento.
      </p>
    );
  }

  return (
    <div ref={setRoot}>
      {/* Justified rows, as on the home page: every photo keeps its own
          shape and grows in proportion to it, so a row ends level. The
          trailing spacer soaks up the last row's slack instead of blowing
          its photos up. */}
      <div className="flex flex-wrap gap-2 [--row:clamp(6.5rem,3rem+11vw,15rem)] after:flex-[999_1_0%] sm:gap-3">
        {photos.map((photo) => {
          const ratio = aspectOf(photo);
          return (
            <a
              key={photo.id}
              data-fancybox="mural"
              href={photo.downloadUrl ?? undefined}
              data-caption={photo.alias || undefined}
              className="group block overflow-hidden rounded-(--radius-sm) bg-(--surface-1)"
              style={{
                flex: `${ratio} 1 calc(${ratio} * var(--row))`,
                aspectRatio: String(ratio),
              }}
            >
              <img
                src={photo.downloadUrl ?? ""}
                alt={
                  photo.alias
                    ? `Foto de ${photo.alias} en ${eventName}`
                    : `Foto de ${eventName}`
                }
                width={photo.width || undefined}
                height={photo.height || undefined}
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-cover transition-transform duration-700 ease-(--ease-out) group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </a>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={loadMore}
            className="nb nb--ghost disabled:opacity-50"
          >
            <span className="nb__label">
              {loadingMore ? "Cargando…" : "Ver más fotos"}
            </span>
            <span className="nb__icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14m-6-6 6 6 6-6" />
              </svg>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Upload dimensions, kept within sane bounds so a panorama cannot take a
 *  whole row; 4:3 when the upload did not record them. */
function aspectOf(photo: { width: number; height: number }): number {
  if (!(photo.width > 0 && photo.height > 0)) return 4 / 3;
  return Math.min(2.4, Math.max(0.56, photo.width / photo.height));
}

export default MuralGallery;
