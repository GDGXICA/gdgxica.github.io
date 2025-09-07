import { useState, useEffect } from "react";

import { Fancybox } from "@fancyapps/ui/dist/fancybox/";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

function useFancybox(options) {
  const [root, setRoot] = useState(null);

  useEffect(() => {
    if (root) {
      Fancybox.bind(root, "[data-fancybox]", options);
      return () => Fancybox.unbind(root);
    }
  }, [root, options]);

  return [setRoot];
}

export const Gallery = ({ gallery }) => {
  const [fancyboxRef] = useFancybox({});
  return (
    <div
      ref={fancyboxRef}
      className="my-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3"
    >
      {gallery.map((image, index) => (
        <a key={index} data-fancybox="gallery" href={image.src}>
          <img
            className="mb-4 aspect-square h-full w-full rounded-lg object-cover hover:cursor-pointer"
            src={image.src}
            alt={image.alt}
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
};
