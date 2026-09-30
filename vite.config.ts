import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/web",
  plugins: [
    agents(),
    react(),
    cloudflare({
      configPath: process.env.WORKBENCH_E2E ? "../../wrangler.e2e.jsonc" : "../../wrangler.jsonc",
    }),
  ],
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
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
