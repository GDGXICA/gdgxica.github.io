import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rules/**/*.test.ts"],
    exclude: ["node_modules"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
