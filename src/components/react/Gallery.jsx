import { useState, useEffect } from "react";

// Module scope gives this a stable identity for the effect's dependency array
// without needing a hook. A `useMemo` here crashed the island with a null React
// dispatcher, and a constant is simpler than debugging that.
const FANCYBOX_OPTIONS = {};

function useFancybox(options) {
  const [root, setRoot] = useState(null);

  useEffect(() => {
    if (!root) return;

    // `init` is async, so an unmount can land before the dynamic imports
    // resolve. Without this flag the cleanup returned below would be a no-op
    // and the Fancybox binding would leak.
    let cancelled = false;

    async function init() {
      const { Fancybox } = await import("@fancyapps/ui/dist/fancybox/");
      await import("@fancyapps/ui/dist/fancybox/fancybox.css");
      if (cancelled) return;
      Fancybox.bind(root, "[data-fancybox]", options);
    }

    init();

    return () => {
      cancelled = true;
      import("@fancyapps/ui/dist/fancybox/").then(({ Fancybox }) => {
        Fancybox.unbind(root);
      });
    };
  }, [root, options]);

  return [setRoot];
}

export const Gallery = ({ gallery }) => {
  const [fancyboxRef] = useFancybox(FANCYBOX_OPTIONS);

  return (
    <ul
      ref={fancyboxRef}
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3"
    >
      {gallery.map((image, index) => (
        <li key={image.src ?? index}>
          <a
            data-fancybox="gallery"
            href={image.src}
            className="group bg-inset block overflow-hidden rounded-md"
          >
            <img
              className="photo-graded aspect-square w-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]"
              src={image.src}
              alt={image.alt || "Foto de un evento de la comunidad GDG Ica"}
              loading="lazy"
              decoding="async"
              width={600}
              height={600}
            />
          </a>
        </li>
      ))}
    </ul>
  );
};
