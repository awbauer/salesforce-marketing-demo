/**
 * Which source paths each Learn section explains. `pnpm learn:check` uses this map in two ways:
 *
 * - **Drift:** when a change touches a mapped path, the sections that explain it must change in
 *   the same branch, or a commit must carry `Learn-Reviewed: <section ids> (<why no update>)`.
 * - **New concepts:** every source file must be mapped to a section here or listed as untaught
 *   below, so a new module can't land without someone deciding where it's taught.
 *
 * Entries are path prefixes: a directory ends with "/", and anything else is a file.
 */
export const SECTION_SOURCES: Record<string, readonly string[]> = {
  // Primers explain ideas rather than code; they change when the ideas do.
  "what-is-context": [],
  "memory-layers": ["apps/edge/src/turn-history.ts"],
  "context-risks": [],
  rag: [],
  "graphrag-explained": [],
  "graphrag-here": [
    "packages/knowledge-graph/src/dataset.ts",
    "packages/knowledge-graph/src/tools.ts",
    "packages/knowledge-graph/src/query-api.ts",
    "packages/knowledge-graph/src/explorer.ts",
    "packages/knowledge-graph/src/index.ts",
    "apps/edge/src/knowledge-graph/",
    "apps/web/src/graph/",
    "apps/web/src/GraphEvidence.tsx",
    "scripts/seed-knowledge-graph.mjs",
    "scripts/check-knowledge-graph.mjs",
  ],
  orchestrator: ["apps/edge/src/orchestrator.ts", "apps/edge/src/index.ts"],
  workspace: [
    "apps/edge/src/working-set.ts",
    "apps/edge/src/focus.ts",
    "apps/web/src/WorkspacePanel.tsx",
    "apps/web/src/ActionCards.tsx",
  ],
  model: [],
  mcp: ["apps/edge/src/campaign-context/server.ts"],
  salesforce: [
    "salesforce/force-app/main/default/aiAuthoringBundles/",
    "salesforce/force-app/main/default/bots/",
    "salesforce/force-app/main/default/mcpServerDefinitions/",
    "packages/contracts/src/tool-catalog.json",
    "salesforce/force-app/main/default/objects/Campaign/",
    "salesforce/force-app/main/default/objects/Activity/",
    "salesforce/force-app/main/default/objects/ContentVersion/",
    "salesforce/force-app/main/default/classes/NorthstarGetCampaignContext.cls",
    "salesforce/force-app/main/default/classes/NorthstarGetConsentSummary.cls",
    "salesforce/force-app/main/default/classes/NorthstarValidateCampaignContent.cls",
    "salesforce/force-app/main/default/classes/NorthstarSaveCampaign.cls",
    "salesforce/force-app/main/default/classes/NorthstarSaveBrief.cls",
    "salesforce/force-app/main/default/classes/NorthstarSaveMessage.cls",
    "salesforce/force-app/main/default/classes/NorthstarSaveCampaignBrief.cls",
    "salesforce/force-app/main/default/classes/NorthstarCreateCampaignReviewRequest.cls",
  ],
  routing: ["apps/edge/src/turn-policy.ts"],
  reliability: ["apps/edge/src/forced-tool-middleware.ts", "apps/edge/src/turn-trace.ts"],
  governance: [
    "apps/edge/src/record-writes.ts",
    "apps/edge/src/auth.ts",
    "apps/web/src/ConfirmationDetails.tsx",
    "packages/contracts/src/index.ts",
    "salesforce/force-app/main/default/classes/NorthstarCheckWriteAccess.cls",
    "salesforce/force-app/main/default/classes/NorthstarConfirmationVerifier.cls",
    "salesforce/force-app/main/default/classes/NorthstarRecordWrites.cls",
    "salesforce/force-app/main/default/objects/Northstar_Brief__c/",
    "salesforce/force-app/main/default/objects/Northstar_Message__c/",
    "salesforce/force-app/main/default/objects/Northstar_Confirmation_Config__c/",
    "salesforce/force-app/main/default/permissionsets/",
  ],
  ui: [
    "apps/web/src/App.tsx",
    "apps/web/src/Markdown.tsx",
    "packages/ui/src/",
    "salesforce/force-app/main/default/lightningTypes/",
    "salesforce/force-app/main/default/uiWidgets/",
  ],
  observability: ["apps/web/src/HistoryView.tsx", "apps/web/src/turn-trace.ts"],
  evaluations: [
    "packages/evals/src/",
    "apps/web/src/EvaluationView.tsx",
    "scripts/run-evals.mjs",
    "scripts/run-live-evals.mjs",
    "scripts/rescore-evals.mjs",
    "scripts/lib/eval-methodology.mjs",
    "scripts/lib/eval-summary.mjs",
  ],
  images: ["salesforce/force-app/main/default/classes/NorthstarAttachCampaignImage.cls"],
  "campaign-context": [
    "apps/edge/src/campaign-context/open-meteo.ts",
    "apps/edge/src/campaign-context/restaurant-profile.ts",
    "packages/knowledge-graph/src/coastline.ts",
  ],
  "long-term-memory": [
    "packages/knowledge-graph/src/memory.ts",
    "apps/edge/src/memory.ts",
    "apps/web/src/MemoryPanel.tsx",
  ],
};

/** Roots whose code files (.ts, .tsx, .mjs, .cls) must each be mapped above or listed as untaught. */
export const TAUGHT_ROOTS = [
  "apps/edge/src/",
  "apps/web/src/",
  "packages/",
  "salesforce/force-app/",
  "scripts/",
] as const;

/** Source files that aren't concepts a reader needs taught, and why. */
export const UNTAUGHT_SOURCES: ReadonlyArray<{ path: string; reason: string }> = [
  { path: "apps/web/src/learn/", reason: "The Learn page itself" },
  { path: "apps/web/src/main.tsx", reason: "React entry point" },
  { path: "apps/edge/src/worker-configuration.d.ts", reason: "Generated Worker types" },
  { path: "apps/edge/src/worker.test-helpers.ts", reason: "Test helpers" },
  {
    path: "salesforce/force-app/main/default/classes/NorthstarCampaignActionsTest.cls",
    reason: "Apex tests",
  },
  {
    path: "salesforce/force-app/main/default/classes/NorthstarRecordActionsTest.cls",
    reason: "Apex tests",
  },
  { path: "scripts/check-blocked-words.mjs", reason: "Delivery gate" },
  { path: "scripts/check-docs.mjs", reason: "Delivery gate" },
  { path: "scripts/check-hxl.mjs", reason: "Delivery gate" },
  { path: "scripts/check-invariants.mjs", reason: "Delivery gate" },
  { path: "scripts/check-learn.mjs", reason: "This gate" },
  { path: "scripts/check-salesforce-metadata.mjs", reason: "Delivery gate" },
  { path: "scripts/install-git-hooks.mjs", reason: "Developer setup" },
  { path: "scripts/verify.mjs", reason: "Delivery gate runner" },
  { path: "scripts/lib/report.mjs", reason: "Gate report helper" },
  { path: "scripts/prove-salesforce-mcp.mjs", reason: "One-time OAuth proof" },
  { path: "scripts/run-live-proof.mjs", reason: "Production smoke test" },
  { path: "scripts/test-production-chat.mjs", reason: "Production smoke test" },
  { path: "scripts/validate-salesforce.mjs", reason: "Salesforce CI validation" },
];

/** Changes to these never need a Learn update: tests, fixtures, and formatting-only files. */
export const DRIFT_IGNORED = [/\.test\.[cm]?[jt]sx?$/, /Test\.cls$/, /-meta\.xml$/, /\.snap$/];
