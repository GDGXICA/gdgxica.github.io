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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-gray-600 dark:text-gray-400">
        No pudimos cargar las fotos ahora mismo.
      </p>
    );
  }

  if (photos.length === 0) {
    return (
      <p className="py-8 text-center text-gray-600 dark:text-gray-400">
        Todavía no hay fotos publicadas de este evento.
      </p>
    );
  }

  return (
    <div ref={setRoot}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => (
          <a
            key={photo.id}
            data-fancybox="mural"
            href={photo.downloadUrl ?? undefined}
            data-caption={photo.alias || undefined}
            className="block overflow-hidden rounded-lg"
          >
            <img
              src={photo.downloadUrl ?? ""}
              alt={
                photo.alias
                  ? `Foto de ${photo.alias} en ${eventName}`
                  : `Foto de ${eventName}`
              }
              loading="lazy"
              className="aspect-square w-full bg-gray-100 object-cover transition hover:opacity-90 dark:bg-gray-800"
            />
          </a>
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={loadMore}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {loadingMore ? "Cargando…" : "Ver más fotos"}
          </button>
        </div>
      )}
    </div>
  );
}

export default MuralGallery;
