import { readFile, readdir } from "node:fs/promises";
import { report } from "./lib/report.mjs";

const widgetRoot = "salesforce/force-app/main/default/uiWidgets/northstarCampaignReadiness";
const typeRoot =
  "salesforce/force-app/main/default/lightningTypes/northstarCampaignReadinessOutput";
const resourceUri = "ui://widget/lightningType/c__northstarCampaignReadinessOutput";
const failures = [];

async function json(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    failures.push(
      `${path} is missing or invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return {};
  }
}

const [composition, widgetSchema, typeSchema, renderer, apex, contracts] = await Promise.all([
  json(`${widgetRoot}/northstarCampaignReadiness.json`),
  json(`${widgetRoot}/schema.json`),
  json(`${typeRoot}/schema.json`),
  json(`${typeRoot}/renderer.json`),
  readFile(
    "salesforce/force-app/main/default/classes/NorthstarValidateCampaignContent.cls",
    "utf8",
  ),
  readFile("packages/contracts/src/index.ts", "utf8"),
]);

if (composition.type !== "lightning__agentforceWidget")
  failures.push("The composition must use lightning__agentforceWidget.");
if (composition.contentBody?.widgetBody?.definition !== "tile/widget")
  failures.push("The composition root must be tile/widget.");

const schemaAttributes = widgetSchema.properties?.attributes?.properties ?? {};
for (const attribute of ["passed", "blockers"])
  if (!(attribute in schemaAttributes)) failures.push(`Widget schema missing ${attribute}.`);

const serializedComposition = JSON.stringify(composition);
if (!serializedComposition.includes("{!$attrs.blockers}"))
  failures.push("Widget composition missing the blockers binding.");

if (typeSchema["lightning:type"] !== "@apexClassType/c__NorthstarValidateCampaignContent$Output")
  failures.push("Lightning type does not reference the bounded readiness Apex output.");

const override = renderer.renderer?.componentOverrides?.$;
if (override?.definition !== "@widget/c/northstarCampaignReadiness")
  failures.push("Renderer does not reference the Northstar readiness widget.");
if (override?.attributes?.passed !== "{!$attrs.passed}")
  failures.push("Renderer does not map the passed field.");
if (override?.attributes?.blockers !== "{!$attrs.blockersJson}")
  failures.push("Renderer does not map the blockers field.");

for (const field of ["public Boolean passed", "public String blockersJson"])
  if (!apex.includes(field)) failures.push(`Apex readiness output missing ${field}.`);
if (!contracts.includes(resourceUri))
  failures.push("The typed native fallback is not bound to the HXL resource URI.");

for (const [root, files] of await Promise.all([
  readdir(widgetRoot).then((files) => [widgetRoot, files]),
  readdir(typeRoot).then((files) => [typeRoot, files]),
]))
  if (files.includes("editor.json"))
    failures.push(`${root} contains unsupported HXL editor.json input configuration.`);

await report("hxl", {
  status: failures.length ? "failed" : "passed",
  widget: "northstarCampaignReadiness",
  lightningType: "northstarCampaignReadinessOutput",
  resourceUri,
  fallback: "native",
  failures,
});

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("HXL source contract passed (1 widget; 1 Lightning type; native fallback).");
