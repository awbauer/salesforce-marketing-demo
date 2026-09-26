import { access, readFile, readdir } from "node:fs/promises";
import catalog from "../packages/contracts/src/tool-catalog.json" with { type: "json" };
import { report } from "./lib/report.mjs";

const root = "salesforce/force-app/main/default";
const requiredFiles = [
  "aiAuthoringBundles/Campaign_Readiness_Governance/Campaign_Readiness_Governance.agent",
  "aiAuthoringBundles/Campaign_Readiness_Governance/Campaign_Readiness_Governance.bundle-meta.xml",
  "classes/NorthstarGetCampaignContext.cls",
  "classes/NorthstarGetConsentSummary.cls",
  "classes/NorthstarValidateCampaignContent.cls",
  "classes/NorthstarCreateCampaignReviewRequest.cls",
  "classes/NorthstarSaveCampaignBrief.cls",
  "classes/NorthstarAttachCampaignImage.cls",
  "classes/NorthstarConfirmationVerifier.cls",
  "classes/NorthstarCampaignActionsTest.cls",
  "classes/NorthstarSaveCampaign.cls",
  "classes/NorthstarSaveBrief.cls",
  "classes/NorthstarSaveMessage.cls",
  "classes/NorthstarRecordWrites.cls",
  "classes/NorthstarCheckWriteAccess.cls",
  "classes/NorthstarRecordActionsTest.cls",
  "objects/Northstar_Brief__c/Northstar_Brief__c.object-meta.xml",
  "objects/Northstar_Message__c/Northstar_Message__c.object-meta.xml",
  "objects/Activity/fields/Northstar_Idempotency_Key__c.field-meta.xml",
  "objects/Campaign/fields/Northstar_Idempotency_Key__c.field-meta.xml",
  "objects/ContentVersion/fields/Northstar_Idempotency_Key__c.field-meta.xml",
  "objects/Northstar_Confirmation_Config__c/Northstar_Confirmation_Config__c.object-meta.xml",
  "objects/Northstar_Confirmation_Config__c/fields/Signing_Key__c.field-meta.xml",
  "mcpServerDefinitions/NorthstarMarketingWorkbench.mcpServerDefinition-meta.xml",
  "permissionsets/Northstar_Marketing_Workbench_Evaluator.permissionset-meta.xml",
];
const supportingFiles = [
  "salesforce/specs/hosted-mcp-server.json",
  "salesforce/specs/phase-2-smoke.json",
  "salesforce/postman/Northstar-Marketing-Workbench.postman_collection.json",
  "migrations/0001_phase2_confirmation_audit.sql",
];
const failures = [];
for (const relative of requiredFiles)
  try {
    await access(`${root}/${relative}`);
  } catch {
    failures.push(`Missing Salesforce source: ${relative}`);
  }
for (const path of supportingFiles)
  try {
    await access(path);
  } catch {
    failures.push(`Missing Phase 2 support artifact: ${path}`);
  }

const agent = await readFile(`${root}/${requiredFiles[0]}`, "utf8");
for (const target of [
  "apex://NorthstarGetCampaignContext",
  "apex://NorthstarGetConsentSummary",
  "apex://NorthstarValidateCampaignContent",
])
  if (!agent.includes(target)) failures.push(`Agent Script missing action target: ${target}`);
for (const forbidden of ["publish", "send", "activate", "delete", "suppress"])
  if (
    catalog.tools.some((tool) => tool.name === forbidden || tool.name.startsWith(`${forbidden}_`))
  )
    failures.push(`Forbidden MCP tool exposed: ${forbidden}`);

const writeTools = catalog.tools.filter((tool) => tool.riskClass === "write");
if (writeTools.some((tool) => tool.autonomous !== false))
  failures.push("Every Salesforce write tool must be excluded from autonomous execution.");
const mcpServer = await readFile(
  `${root}/mcpServerDefinitions/NorthstarMarketingWorkbench.mcpServerDefinition-meta.xml`,
  "utf8",
);
const exposedToolNames = [...mcpServer.matchAll(/<toolName>([^<]+)<\/toolName>/g)].map(
  ([, name]) => name,
);
const expectedToolNames = catalog.tools.map((tool) => tool.name);
for (const toolName of expectedToolNames)
  if (!exposedToolNames.includes(toolName))
    failures.push(`Hosted MCP server missing catalog tool: ${toolName}`);
for (const toolName of exposedToolNames)
  if (!expectedToolNames.includes(toolName))
    failures.push(`Hosted MCP server exposes uncatalogued tool: ${toolName}`);
if (new Set(exposedToolNames).size !== exposedToolNames.length)
  failures.push("Hosted MCP server contains duplicate tool names.");
const summaryToolBlock = mcpServer
  .split("<tools>")
  .find((block) => block.includes("<toolName>summarize_campaign</toolName>"));
if (!summaryToolBlock?.includes("<apiIdentifier>ag:Campaign_Readiness_Governance</apiIdentifier>"))
  failures.push(
    "summarize_campaign must use the bounded readiness agent instead of a business-unit-dependent agent.",
  );
if (!summaryToolBlock?.includes("<readOnly>true</readOnly>"))
  failures.push("summarize_campaign must be declared read-only.");
for (const [toolName, apexClass] of [
  ["save_campaign_brief", "NorthstarSaveCampaignBrief"],
  ["create_campaign_review_request", "NorthstarCreateCampaignReviewRequest"],
  ["attach_campaign_image", "NorthstarAttachCampaignImage"],
  ["save_campaign", "NorthstarSaveCampaign"],
  ["save_brief", "NorthstarSaveBrief"],
  ["save_message", "NorthstarSaveMessage"],
]) {
  const toolBlock = mcpServer
    .split("<tools>")
    .find((block) => block.includes(`<toolName>${toolName}</toolName>`));
  if (!toolBlock?.includes(`<apiIdentifier>aa:apex-${apexClass}</apiIdentifier>`))
    failures.push(`Hosted MCP write tool ${toolName} is not bound to ${apexClass}.`);
  if (!toolBlock?.includes(`<operation>${apexClass}</operation>`))
    failures.push(`Hosted MCP write tool ${toolName} has the wrong Apex operation.`);
  if (!toolBlock?.includes("<readOnly>false</readOnly>"))
    failures.push(`Hosted MCP write tool ${toolName} is incorrectly marked read-only.`);
  if (!toolBlock?.includes("<idempotent>true</idempotent>"))
    failures.push(`Hosted MCP write tool ${toolName} must declare idempotency.`);

  const apex = await readFile(`${root}/classes/${apexClass}.cls`, "utf8");
  for (const declaration of [
    `global with sharing class ${apexClass}`,
    "global class Input",
    "global class Output",
    "global static List<Output> run",
  ])
    if (!apex.includes(declaration))
      failures.push(`${apexClass} is not globally discoverable: missing ${declaration}`);
  if (!apex.includes("Versioned, unexpired, same-user signed confirmation token"))
    failures.push(`${apexClass} does not declare the signed confirmation-token contract.`);
  if (!apex.includes("NorthstarConfirmationVerifier.requireValid"))
    failures.push(`${apexClass} does not verify host-signed confirmation evidence.`);
}
const verifier = await readFile(`${root}/classes/NorthstarConfirmationVerifier.cls`, "utf8");
for (const invariant of [
  "HmacSHA256",
  "Crypto.generateMac",
  "MAX_FUTURE_SECONDS = 300",
  "Northstar_Confirmation_Config__c.getOrgDefaults",
])
  if (!verifier.includes(invariant))
    failures.push(`Confirmation verifier missing invariant: ${invariant}`);
const classFiles = (await readdir(`${root}/classes`)).filter((name) => name.endsWith(".cls"));
if (!classFiles.some((name) => name.endsWith("Test.cls")))
  failures.push("No Apex test class found.");

await report("salesforce-metadata", {
  status: failures.length ? "failed" : "passed",
  requiredFiles,
  supportingFiles,
  agentActionTargets: 3,
  toolCount: catalog.tools.length,
  hostedMcpToolCount: exposedToolNames.length,
  writeTools: writeTools.map((tool) => tool.name),
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Salesforce metadata contract passed (${requiredFiles.length} files; ${catalog.tools.length} tools).`,
);
