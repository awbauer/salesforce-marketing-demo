import { fileURLToPath, URL } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@workbench/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@workbench/knowledge-graph": fileURLToPath(
        new URL("./packages/knowledge-graph/src/index.ts", import.meta.url),
      ),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          ENVIRONMENT: "local",
          AUTH_MODE: "development",
          CHAT_ENGINE: "fixture",
          SALESFORCE_MCP_URL: "https://salesforce-mcp.example.test/mcp",
        },
      },
    }),
  ],
  test: { include: ["apps/edge/**/*.worker.test.ts"] },
});
