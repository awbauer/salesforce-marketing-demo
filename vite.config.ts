import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "apps/web",
  plugins: [
    agents(),
    react(),
    cloudflare({
      configPath: process.env.NORTHSTAR_E2E ? "../../wrangler.e2e.jsonc" : "../../wrangler.jsonc",
    }),
  ],
  resolve: {
    alias: {
      "@northstar/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@northstar/ui": fileURLToPath(new URL("./packages/ui/src/index.tsx", import.meta.url)),
    },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
