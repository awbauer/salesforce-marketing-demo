import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@northstar/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@northstar/ui": fileURLToPath(new URL("./packages/ui/src/index.tsx", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "scripts/**/*.test.mjs"],
    setupFiles: ["./tests/setup.ts"],
  },
});
