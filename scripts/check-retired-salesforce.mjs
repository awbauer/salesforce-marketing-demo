// Fails if any metadata the workbench retired still exists in the target Salesforce org, so
// source and org can't drift apart unnoticed. The retired list is the checked-in
// salesforce/manifest/retired/destructiveChangesPost.xml; deploy it with that manifest to delete.
// Usage: SF_TARGET_ORG=northstar-pot pnpm sf:retired:check
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { report } from "./lib/report.mjs";

const targetOrg = process.env.SF_TARGET_ORG?.trim();
if (!targetOrg) {
  console.error("Set SF_TARGET_ORG to the org alias to check.");
  process.exit(2);
}
const manifest = readFileSync("salesforce/manifest/retired/destructiveChangesPost.xml", "utf8");
const retired = {};
for (const [, block] of manifest.matchAll(/<types>([\s\S]*?)<\/types>/g)) {
  const type = block.match(/<name>([^<]+)<\/name>/)?.[1];
  if (type) retired[type] = [...block.matchAll(/<members>([^<]+)<\/members>/g)].map((m) => m[1]);
}

function query(soql, tooling = false) {
  const result = spawnSync(
    "sf",
    [
      "data",
      "query",
      "--query",
      soql,
      "--target-org",
      targetOrg,
      "--json",
      ...(tooling ? ["--use-tooling-api"] : []),
    ],
    { encoding: "utf8", env: { ...process.env, SF_DISABLE_TELEMETRY: "true" } },
  );
  const parsed = JSON.parse(result.stdout || "{}");
  if (parsed.status !== 0) throw new Error(`Query failed: ${soql}`);
  return parsed.result.records;
}
const quoted = (names) => names.map((name) => `'${name.replaceAll("'", "")}'`).join(",");

const present = [];
if (retired.ApexClass?.length)
  for (const record of query(
    `SELECT Name FROM ApexClass WHERE Name IN (${quoted(retired.ApexClass)})`,
    true,
  ))
    present.push(`ApexClass ${record.Name}`);
if (retired.CustomObject?.length)
  for (const record of query(
    `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName IN (${quoted(retired.CustomObject)})`,
  ))
    present.push(`CustomObject ${record.QualifiedApiName}`);
for (const field of retired.CustomField ?? []) {
  const [object, name] = field.split(".");
  if (
    query(
      `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND QualifiedApiName = '${name}'`,
    ).length
  )
    present.push(`CustomField ${field}`);
}

const checked = Object.values(retired).reduce((sum, names) => sum + names.length, 0);
await report("salesforce-retired", {
  status: present.length ? "failed" : "passed",
  checked,
  present,
});
if (present.length) {
  console.error(
    `Retired Salesforce metadata still exists in ${targetOrg}: ${present.join(", ")}.\nDelete it with the salesforce/manifest/retired manifest (see docs/salesforce-deployment-pipeline.md).`,
  );
  process.exit(1);
}
console.log(
  `Retired metadata check passed: none of ${checked} retired components exist in ${targetOrg}.`,
);
