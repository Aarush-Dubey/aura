import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Deterministic FSRS/scheduler math must not depend on wall-clock jitter
    // across workers; keep reporting compact for CI logs.
    reporters: process.env.CI ? ["default"] : ["default"],
  },
  resolve: {
    // Source uses NodeNext ".js" specifiers that point at ".ts" sources.
    // Vite's resolver already maps these, but pin the extension order so a
    // stray compiled ".js" in the tree can never shadow the ".ts" source.
    extensions: [".ts", ".mts", ".js", ".mjs", ".json"],
  },
});
