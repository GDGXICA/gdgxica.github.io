// @ts-nocheck
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

import react from "@astrojs/react";

// https://astro.build/config
const useFirebaseEmulator = process.env.PUBLIC_USE_FIREBASE_EMULATOR === "true";

export default defineConfig({
  site: "https://gdgica.com",

  vite: {
    plugins: [tailwindcss()],
    server: useFirebaseEmulator
      ? {
          proxy: {
            "/api": {
              target: "http://127.0.0.1:5001/appgdgica/us-central1/api",
              changeOrigin: true,
            },
          },
        }
      : undefined,
  },

  integrations: [
    sitemap({
      filter: (page) => !page.includes("/admin"),
    }),
    react({
      include: ["**/react/**"],
    }),
  ],
});
