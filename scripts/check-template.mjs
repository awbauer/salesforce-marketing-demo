// Keeps the repository a clean template: no instance-specific files or example-client names are
// tracked, and every industry pack and shipped profile is valid. Instance data lives in ignored
// files (workbench.profile.json, data/instance-dataset.json, .workbench/, .config/).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PackSchema } from "../packages/contracts/src/pack.ts";
import { PACKS } from "../packages/industry-packs/src/index.ts";
import { buildInstance } from "./lib/instance.mjs";
import { report } from "./lib/report.mjs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\0")
  .filter(Boolean);
const failures = [];

const INSTANCE_FILES = [
  /^workbench\.profile\.json$/,
  /^data\/instance-dataset\.json$/,
  /^\.workbench\//,
  /^\.config\//,
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.dev\.vars/,
];
for (const path of tracked)
  if (INSTANCE_FILES.some((pattern) => pattern.test(path)))
    failures.push(`Instance-specific file is tracked: ${path}`);

// Names and identifiers from the proof this template grew out of. They live only in the archive.
const PARTS = [
  "north" + "star",
  "coast" + "line",
  "harbor" + "stone",
  "becurious",
  "120cf689",
  "701jV000004" + "GglIQAS",
];
const LEFTOVERS = new RegExp(PARTS.join("|"), "i");
const SKIP =
  /^(docs\/archive\/|pnpm-lock\.yaml$|scripts\/check-template\.mjs$|packages\/contracts\/src\/generated\/)/;
const BINARY = /\.(png|jpe?g|gif|ico|woff2?|zip|pdf)$/i;
let scanned = 0;
for (const path of tracked) {
  if (SKIP.test(path) || BINARY.test(path)) continue;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  scanned += 1;
  const count = text.match(new RegExp(LEFTOVERS, "gi"))?.length ?? 0;
  if (count) failures.push(`${path}: ${count} leftover proof-era name(s)`);
}

for (const [id, pack] of Object.entries(PACKS)) {
  const parsed = PackSchema.safeParse(pack);
  if (!parsed.success)
    failures.push(`Pack ${id} is invalid: ${parsed.error.message.slice(0, 200)}`);
  if (pack.id !== id) failures.push(`Pack ${id} declares id ${pack.id}`);
}
for (const profile of ["profiles/example.profile.json", "profiles/demo-composite.profile.json"])
  try {
    buildInstance(JSON.parse(readFileSync(profile, "utf8")));
  } catch (error) {
    failures.push(`${profile} is invalid: ${error.message.slice(0, 200)}`);
  }

await report("template", {
  status: failures.length ? "failed" : "passed",
  scannedFiles: scanned,
  packs: Object.keys(PACKS),
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Template check passed (${scanned} files scanned; ${Object.keys(PACKS).length} packs).`,
);
