// @ts-nocheck
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

import react from "@astrojs/react";

// https://astro.build/config
// Unlike import.meta.env (used by src/lib/firebase.ts and src/lib/api.ts),
// Astro does not load .env files into process.env before evaluating this
// config file — only real shell-exported vars land here by default. Load
// .env explicitly so PUBLIC_USE_FIREBASE_EMULATOR set in a .env file is
// picked up the same way it is by the client SDK, instead of silently
// leaving the /api proxy below off while the client still connects to the
// emulator.
try {
  process.loadEnvFile();
} catch {
  // No .env file present — fine, PUBLIC_USE_FIREBASE_EMULATOR is opt-in.
}
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
