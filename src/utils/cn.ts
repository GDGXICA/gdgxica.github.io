import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's stock font sizes, so it classified our
 * custom `text-h2` / `text-lead` utilities as colours and silently dropped them
 * whenever a `text-<colour>` class followed. Registering them as font sizes
 * makes conflict resolution correct in both directions.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["display", "h1", "h2", "h3", "h4", "lead", "ui", "overline"],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
