import { access, readFile } from "node:fs/promises";
import { report } from "./lib/report.mjs";

const required = [
  "AGENTS.md",
  "docs/getting-started-for-agents.md",
  "docs/agent-delivery-contract.md",
  "docs/agentic-marketing-workbench-plan.md",
  "docs/work-units/WU-002-phase-1-foundation.md",
  "docs/work-units/WU-003-phase-2-salesforce-core.md",
  "docs/work-units/WU-004-blocked-word-delivery-gate.md",
  "docs/security/phase-1-threat-model.md",
  "infra/cloudflare/pot/README.md",
];
const failures = [];
for (const path of required)
  try {
    await access(path);
  } catch {
    failures.push(`Missing ${path}`);
  }
const units = await Promise.all([readFile(required[5], "utf8"), readFile(required[6], "utf8")]);
for (const heading of [
  "## Acceptance criteria",
  "## Verification",
  "## Evidence",
  "## External mutations",
])
  for (const [index, unit] of units.entries())
    if (!unit.includes(heading)) failures.push(`Work unit ${index + 3} missing ${heading}`);
await report("documentation", {
  status: failures.length ? "failed" : "passed",
  required,
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Documentation contract passed (${required.length} required artifacts).`);
