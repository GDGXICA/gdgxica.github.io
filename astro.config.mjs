// @ts-nocheck
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://gdgxica.github.io/gdgica.com",
  // base: "/gdgica.com",
  vite: {
    plugins: [tailwindcss()],
  },
});
