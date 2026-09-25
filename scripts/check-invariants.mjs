import { readFile } from "node:fs/promises";
import { PROOF_DEFAULTS } from "../packages/contracts/src/index.ts";
import { report } from "./lib/report.mjs";

const wrangler = await readFile("wrangler.jsonc", "utf8");
const catalog = JSON.parse(await readFile("packages/contracts/src/tool-catalog.json", "utf8"));
const required = [
  PROOF_DEFAULTS.imageModel,
  '"new_sqlite_classes"',
  '"CAMPAIGN_ASSETS"',
  '"APP_DB"',
  '"database_id": "120cf689-0652-476c-9e4e-8af5b83e3627"',
  '"bucket_name": "northstar-marketing-workbench-pot-campaign-assets"',
];
const forbidden = [
  "publish",
  "send",
  "activate",
  "delete",
  "suppress",
  "buyer-group",
  "arbitrary-crud",
];
const orchestratorSource = await readFile("apps/edge/src/orchestrator.ts", "utf8");
const failures = required
  .filter((value) => !wrangler.includes(value))
  .map((value) => `Missing config invariant: ${value}`);
if (/ORCHESTRATOR_MODEL/.test(wrangler))
  failures.push("Orchestrator model must be set only in PROOF_DEFAULTS, not wrangler.jsonc");
if (!orchestratorSource.includes("workersAI(PROOF_DEFAULTS.orchestratorModel)"))
  failures.push("Orchestrator must read its model from PROOF_DEFAULTS.orchestratorModel");
for (const value of forbidden)
  if (PROOF_DEFAULTS.allowedWrites.some((item) => item.includes(value)))
    failures.push(`Forbidden write exposed: ${value}`);
for (const tool of catalog.tools) {
  if (!["read", "draft", "write"].includes(tool.riskClass))
    failures.push(`Unapproved tool risk: ${tool.name}/${tool.riskClass}`);
  if (tool.riskClass === "write") {
    if (tool.autonomous !== false) failures.push(`Write tool is autonomous: ${tool.name}`);
    if (!PROOF_DEFAULTS.allowedWrites.includes(tool.allowedWrite))
      failures.push(`Write tool is outside Section 17: ${tool.name}/${tool.allowedWrite}`);
  }
}
await report("contracts", {
  status: failures.length ? "failed" : "passed",
  fixedDefaults: PROOF_DEFAULTS,
  toolCatalog: catalog,
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Contract invariants passed (${required.length} config checks; ${forbidden.length} forbidden classes).`,
);
