import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/__manual__/**", "**/node_modules/**"],
    testTimeout: 20000,
  },
});
