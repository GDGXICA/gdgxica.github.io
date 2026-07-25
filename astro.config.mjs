// @ts-nocheck
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

import react from "@astrojs/react";

// https://astro.build/config
try {
  process.loadEnvFile();
} catch {}
const useFirebaseEmulator = process.env.PUBLIC_USE_FIREBASE_EMULATOR === "true";

// The functions emulator serves each function under its PROJECT ID, so this
// proxy target has to match whatever project the emulator was started with.
// The default mirrors .firebaserc, which is what `firebase emulators:start`
// picks with no --project flag.
//
// Overridable because the flow breaks silently otherwise: starting the
// emulator with a demo project (as `pnpm test:rules` does, and as anyone
// wanting a hard guarantee of no production access would) makes every /api
// call 404 with nothing explaining why.
const emulatorProject = process.env.FIREBASE_EMULATOR_PROJECT ?? "appgdgica";

export default defineConfig({
  site: "https://gdgica.com",

  vite: {
    plugins: [tailwindcss()],
    server: useFirebaseEmulator
      ? {
          proxy: {
            "/api": {
              target: `http://127.0.0.1:5001/${emulatorProject}/us-central1/api`,
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
