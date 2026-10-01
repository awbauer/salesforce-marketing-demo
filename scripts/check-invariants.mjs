import { readFile } from "node:fs/promises";
import { DEFAULTS } from "../packages/contracts/src/index.ts";
import { report } from "./lib/report.mjs";

const wrangler = await readFile("wrangler.jsonc", "utf8");
const catalog = JSON.parse(await readFile("packages/contracts/src/tool-catalog.json", "utf8"));
const cloudflareTemplate = await readFile(
  "templates/cloudflare/wrangler.cloudflare.jsonc.tmpl",
  "utf8",
);
const required = ['"new_sqlite_classes"', '"CAMPAIGN_ASSETS"', '"APP_DB"'];
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
// The latest migration that rebuilds the confirmation audit defines its allowed actions.
const confirmationMigration = await readFile("migrations/0005_inventory_case_action.sql", "utf8");
const failures = required
  .flatMap((value) => [
    ...(wrangler.includes(value) ? [] : [`wrangler.jsonc is missing ${value}`]),
    ...(cloudflareTemplate.includes(value) ? [] : [`Cloudflare template is missing ${value}`]),
  ])
  .map((value) => `Missing config invariant: ${value}`);
// The checked-in local config must run with no account: no ids, routes, or hosted bindings.
for (const [label, pattern] of [
  ["a database_id", /"database_id"/],
  ["an account_id", /"account_id"/],
  ["routes", /"routes?"\s*:/],
  ["an AI binding", /"ai"\s*:/],
  ["a model id", /ORCHESTRATOR_MODEL|@cf\//],
])
  if (pattern.test(wrangler))
    failures.push(`wrangler.jsonc must stay account-free: found ${label}`);
if (!/resolveChatModel\(INSTANCE_PROFILE/.test(orchestratorSource))
  failures.push("Orchestrator must resolve its chat model from the instance profile");
if (/@cf\//.test(orchestratorSource))
  failures.push("Orchestrator must not hard-code a model id; set it in the instance profile");
for (const value of forbidden)
  if (DEFAULTS.allowedWrites.some((item) => item.includes(value)))
    failures.push(`Forbidden write exposed: ${value}`);
const auditActionClause = confirmationMigration.match(/action IN \(([\s\S]*?)\)\s*\)/)?.[1] ?? "";
const auditedActions = [...auditActionClause.matchAll(/'([^']+)'/g)]
  .map((match) => match[1])
  .sort();
const allowedActions = [...DEFAULTS.allowedWrites].sort();
// Retired actions stay in the audit's CHECK so rows written before they were retired remain valid.
const RETIRED_ACTIONS = ["save-brief", "save-campaign", "save-draft-campaign", "save-message"];
const expectedAudit = [...allowedActions, ...RETIRED_ACTIONS].sort();
if (JSON.stringify(auditedActions) !== JSON.stringify(expectedAudit))
  failures.push(
    `Confirmation audit actions differ from the governed write contract: expected ${expectedAudit.length}, found ${auditedActions.length}`,
  );
for (const tool of catalog.tools) {
  if (!["read", "draft", "write"].includes(tool.riskClass))
    failures.push(`Unapproved tool risk: ${tool.name}/${tool.riskClass}`);
  if (tool.riskClass === "write") {
    if (tool.autonomous !== false) failures.push(`Write tool is autonomous: ${tool.name}`);
    if (!DEFAULTS.allowedWrites.includes(tool.allowedWrite))
      failures.push(
        `Write tool is outside DEFAULTS.allowedWrites: ${tool.name}/${tool.allowedWrite}`,
      );
  }
}
await report("contracts", {
  status: failures.length ? "failed" : "passed",
  fixedDefaults: DEFAULTS,
  toolCatalog: catalog,
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Contract invariants passed (${required.length} config checks; ${forbidden.length} forbidden classes; ${auditedActions.length} audited actions).`,
);
