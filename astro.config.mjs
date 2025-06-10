// @ts-nocheck
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://GDGXICA.github.io",
  base: "/gdgica.com",
  vite: {
    plugins: [tailwindcss()],
  },
});
