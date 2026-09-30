import { access, readdir, readFile } from "node:fs/promises";
import { report } from "./lib/report.mjs";

const required = [
  "AGENTS.md",
  "README.md",
  "docs/getting-started-for-agents.md",
  "docs/agent-delivery-contract.md",
  "docs/architecture.md",
  "docs/security/threat-model.md",
  "docs/demo/evaluator-guide.md",
  "docs/decisions/ADR-009-portable-instances.md",
  "templates/cloudflare/README.md",
];
const failures = [];
for (const path of required)
  try {
    await access(path);
  } catch {
    failures.push(`Missing ${path}`);
  }
// Every work unit must carry the sections the delivery contract requires.
const units = (await readdir("docs/work-units")).filter((name) => /^WU-\d+/.test(name));
if (!units.length) failures.push("No work units under docs/work-units");
for (const name of units) {
  const unit = await readFile(`docs/work-units/${name}`, "utf8");
  for (const heading of ["## Acceptance criteria", "## Verification", "## Evidence"])
    if (!unit.includes(heading)) failures.push(`${name} is missing ${heading}`);
}
await report("documentation", {
  status: failures.length ? "failed" : "passed",
  required,
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Documentation contract passed (${required.length} required artifacts; ${units.length} work units).`,
);
