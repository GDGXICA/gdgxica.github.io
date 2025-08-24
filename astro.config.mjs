// @ts-nocheck
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://gdgxica.github.io",

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    sitemap(),
    react({
      include: ["**/react/*"],
    }),
  ],
});
