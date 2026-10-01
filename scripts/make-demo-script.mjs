// Writes .workbench/demo-script.md: a run-sheet for the current instance profile.
// Usage: pnpm workbench:script   (run after `pnpm profile:build`; `pnpm workbench:init` does both)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_USE_CASES } from "../apps/web/src/usecases/catalog.ts";
import { INSTANCE_PACK, INSTANCE_PROFILE } from "../packages/contracts/src/index.ts";
import { detectOllama, renderDemoScript } from "./lib/init.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootFlag = process.argv.indexOf("--root");
const outDir = join(rootFlag > -1 ? process.argv[rootFlag + 1] : root, ".workbench");
const chat = INSTANCE_PROFILE.models.chat;
const local = chat.provider === "ollama" || chat.provider === "openai-compatible";
const installed = local ? await detectOllama(chat.baseUrl) : undefined;
const useCases = INSTANCE_PROFILE.useCases
  .map((id) => ALL_USE_CASES.find((useCase) => useCase.id === id))
  .filter((useCase) => useCase?.status === "available");
const text = renderDemoScript({
  profile: INSTANCE_PROFILE,
  pack: INSTANCE_PACK,
  useCases,
  model: {
    name: chat.model,
    baseUrl: chat.baseUrl ?? "http://127.0.0.1:11434/v1",
    reachable: local ? installed !== null && installed.includes(chat.model) : true,
  },
});
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "demo-script.md"), text);
console.log(`Wrote ${join(outDir, "demo-script.md")} (${useCases.length} use cases).`);
