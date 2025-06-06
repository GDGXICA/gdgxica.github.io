import { defineConfig } from "eslint/config";
import eslintPluginAstro from "eslint-plugin-astro";
import js from "@eslint/js";

export default defineConfig([
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      ".astro/",
      "public/",
      "*.config.js",
      "*.config.cjs",
      "*.config.mjs",
      "*.config.ts",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    rules: {
      eqeqeq: ["error", "always"], // Forzar el uso de '===' en lugar de '==' para evitar errores sutiles.
      "no-console": "warn", // Advertir si hay `console.log` olvidados en el código.
    },
  },
]);
