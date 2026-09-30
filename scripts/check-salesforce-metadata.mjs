import { access, readdir, readFile } from "node:fs/promises";
import catalog from "../packages/contracts/src/tool-catalog.json" with { type: "json" };
import { report } from "./lib/report.mjs";

const root = "salesforce/force-app/main/default";
const requiredFiles = [
  "aiAuthoringBundles/Campaign_Readiness_Governance/Campaign_Readiness_Governance.agent",
  "aiAuthoringBundles/Campaign_Readiness_Governance/Campaign_Readiness_Governance.bundle-meta.xml",
  "classes/WorkbenchGetCampaignContext.cls",
  "classes/WorkbenchGetConsentSummary.cls",
  "classes/WorkbenchValidateCampaignContent.cls",
  "classes/WorkbenchCreateCampaignReviewRequest.cls",
  "classes/WorkbenchAttachCampaignImage.cls",
  "classes/WorkbenchConfirmationVerifier.cls",
  "classes/WorkbenchCampaignActionsTest.cls",
  "classes/WorkbenchCheckWriteAccess.cls",
  "classes/WorkbenchGetMarketingRecords.cls",
  "classes/WorkbenchMarketingAgentTest.cls",
  "aiAuthoringBundles/Workbench_Campaign_Creation/Workbench_Campaign_Creation.agent",
  "objects/Activity/fields/Workbench_Idempotency_Key__c.field-meta.xml",
  "objects/ContentVersion/fields/Workbench_Idempotency_Key__c.field-meta.xml",
  "objects/Case/fields/Workbench_Idempotency_Key__c.field-meta.xml",
  "classes/WorkbenchCreateInventoryCase.cls",
  "objects/Workbench_Confirmation_Config__c/Workbench_Confirmation_Config__c.object-meta.xml",
  "objects/Workbench_Confirmation_Config__c/fields/Signing_Key__c.field-meta.xml",
  "mcpServerDefinitions/MarketingWorkbench.mcpServerDefinition-meta.xml",
  "permissionsets/Marketing_Workbench_Evaluator.permissionset-meta.xml",
];
const supportingFiles = [
  "salesforce/specs/hosted-mcp-server.json",
  "salesforce/specs/phase-2-smoke.json",
  "salesforce/postman/Marketing-Workbench.postman_collection.json",
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
  "apex://WorkbenchGetCampaignContext",
  "apex://WorkbenchGetConsentSummary",
  "apex://WorkbenchValidateCampaignContent",
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
  `${root}/mcpServerDefinitions/MarketingWorkbench.mcpServerDefinition-meta.xml`,
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
// Briefs and campaigns are created by the Marketing Cloud Next Campaign Creation agent, never by
// custom Apex: those write tools must be bound to that agent, whose script runs the standard
// Marketing Cloud actions.
const campaignAgent = await readFile(
  `${root}/aiAuthoringBundles/Workbench_Campaign_Creation/Workbench_Campaign_Creation.agent`,
  "utf8",
);
if (!campaignAgent.includes('agent_template: "MktCloud__CampaignCreationAgent"'))
  failures.push("Workbench_Campaign_Creation must be a Marketing Cloud Campaign Creation agent.");
for (const target of [
  "flow://MktCloud__GenerateBrief",
  "standardInvocableAction://saveBrief",
  "flow://MktCloud__GenerateCampaignFromBrief",
  "standardInvocableAction://createCampaign",
  "flow://MktCloud__SaveCampaign",
  "flow://MktCloud__RefineCampaignPreview",
])
  if (!campaignAgent.includes(target))
    failures.push(`Campaign Creation agent missing standard Marketing Cloud action: ${target}`);
for (const toolName of [
  "draft_campaign_brief",
  "refine_campaign_preview",
  "save_marketing_brief",
  "create_marketing_campaign",
]) {
  const toolBlock = mcpServer
    .split("<tools>")
    .find((block) => block.includes(`<toolName>${toolName}</toolName>`));
  if (!toolBlock?.includes("<apiIdentifier>ag:Workbench_Campaign_Creation</apiIdentifier>"))
    failures.push(`${toolName} must call the Marketing Cloud Campaign Creation agent.`);
}
for (const retired of ["Workbench_Brief__c", "Workbench_Message__c", "WorkbenchSaveMessage"])
  if (mcpServer.includes(retired))
    failures.push(`Hosted MCP server still references the retired custom write ${retired}.`);
for (const [toolName, apexClass] of [
  ["create_campaign_review_request", "WorkbenchCreateCampaignReviewRequest"],
  ["attach_campaign_image", "WorkbenchAttachCampaignImage"],
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
  if (!apex.includes("WorkbenchConfirmationVerifier.requireValid"))
    failures.push(`${apexClass} does not verify host-signed confirmation evidence.`);
}
const verifier = await readFile(`${root}/classes/WorkbenchConfirmationVerifier.cls`, "utf8");
for (const invariant of [
  "HmacSHA256",
  "Crypto.generateMac",
  "MAX_FUTURE_SECONDS = 300",
  "Workbench_Confirmation_Config__c.getOrgDefaults",
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
