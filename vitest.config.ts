import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@workbench/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@workbench/knowledge-graph": fileURLToPath(
        new URL("./packages/knowledge-graph/src/index.ts", import.meta.url),
      ),
      "@workbench/ui": fileURLToPath(new URL("./packages/ui/src/index.tsx", import.meta.url)),
      "@workbench/evals/report": fileURLToPath(
        new URL("./packages/evals/src/report.ts", import.meta.url),
      ),
      "@workbench/evals/pricing": fileURLToPath(
        new URL("./packages/evals/src/pricing.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "apps/web/**/*.test.ts",
      "apps/web/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "scripts/**/*.test.mjs",
    ],
    setupFiles: ["./tests/setup.ts"],
  },
});
