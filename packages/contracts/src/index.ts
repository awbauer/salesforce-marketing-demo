import { z } from "zod";

export const PROOF_DEFAULTS = Object.freeze({
  workspaceId: "northstar-demo",
  orchestratorModel: "@cf/openai/gpt-oss-20b",
  imageModel: "@cf/black-forest-labs/flux-2-klein-4b",
  imageSize: 1024,
  imageCap: 100,
  spendCapUsd: 25,
  transcriptRetentionDays: 14,
  imageRetentionDays: 7,
  roles: ["evaluator", "demo-admin"] as const,
  browsers: ["chrome", "edge"] as const,
  allowedWrites: ["save-draft-campaign", "create-review-task", "attach-generated-image"] as const,
});

export const PrincipalSchema = z.object({
  subject: z.string().min(1),
  email: z.email(),
  role: z.enum(PROOF_DEFAULTS.roles),
  tenantId: z.string().min(1),
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const SourceSchema = z.object({
  system: z.enum(["salesforce", "data-360", "marketing-cloud-next", "cloudflare"]),
  label: z.string(),
  freshness: z.string(),
  status: z.enum(["ready", "stale", "unavailable", "permission-denied"]),
});

export const SalesforceErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "PERMISSION_DENIED",
  "FIELD_POLICY_BLOCKED",
  "VALIDATION_FAILED",
  "CONFIRMATION_REQUIRED",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "CONFLICT",
]);

export const ConnectorStateSchema = z.object({
  id: z.literal("salesforce"),
  label: z.literal("Salesforce agents"),
  state: z.enum(["not-configured", "disconnected", "authenticating", "ready", "expired", "error"]),
  toolCount: z.number().int().nonnegative(),
  message: z.string().max(240),
  authUrl: z.url().optional(),
  errorCode: SalesforceErrorCodeSchema.optional(),
});
export type ConnectorState = z.infer<typeof ConnectorStateSchema>;

export const ConfirmationSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["save-draft-campaign", "create-review-task"]),
  recordId: z.string().regex(/^[a-zA-Z0-9]{15,18}$/),
  principalSubject: z.string().min(1),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
  summary: z.string().min(1).max(500),
  expiresAt: z.string().datetime(),
  status: z.enum(["pending", "confirmed", "denied", "expired", "executed"]),
});
export type Confirmation = z.infer<typeof ConfirmationSchema>;

export const PortableTilePresentationSchema = z.object({
  kind: z.literal("hxl"),
  resourceUri: z.string().regex(/^ui:\/\/widget\/lightningType\/c__[a-zA-Z0-9_]+$/),
  sourceStatus: z.enum(["source-validated", "deployed", "unavailable"]),
  fallback: z.literal("native"),
});
export type PortableTilePresentation = z.infer<typeof PortableTilePresentationSchema>;

export const PHASE_2_AUTONOMOUS_TOOLS = Object.freeze([
  "draft_campaign_brief",
  "refine_campaign_preview",
  "summarize_campaign",
  "generate_campaign_insights",
  "draft_campaign_content",
  "create_content_section",
  "validate_content_against_brand",
  "get_account_marketing_signals",
  "recommend_buyer_group_members",
  "summarize_account_engagement",
  "check_campaign_readiness",
] as const);

export const PHASE_2_CURATED_TOOLS = Object.freeze([
  ...PHASE_2_AUTONOMOUS_TOOLS,
  "save_campaign_brief",
  "create_campaign_review_request",
] as const);

export const InsightTileSchema = z.object({
  id: z.string(),
  kind: z.enum(["campaign-brief", "readiness", "performance", "account-signals", "content-draft"]),
  title: z.string(),
  eyebrow: z.string(),
  summary: z.string(),
  metric: z.string().optional(),
  trend: z.string().optional(),
  state: z.enum(["ready", "loading", "empty", "error", "stale", "permission-denied"]),
  source: SourceSchema,
  details: z.array(z.string()),
  recordRef: z
    .object({ system: z.literal("salesforce"), objectApiName: z.string(), recordId: z.string() })
    .optional(),
  presentation: PortableTilePresentationSchema.optional(),
});
export type InsightTile = z.infer<typeof InsightTileSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  occurredAt: z.string(),
  status: z.enum(["complete", "active", "blocked"]),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const OrchestratorStateSchema = z.object({
  workspaceId: z.literal(PROOF_DEFAULTS.workspaceId),
  tiles: z.array(InsightTileSchema),
  activity: z.array(ActivityEventSchema),
  sourcesConnected: z.number().int().nonnegative(),
  connector: ConnectorStateSchema,
  pendingConfirmation: ConfirmationSchema.nullable(),
});
export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>;

export const SessionSchema = z.object({
  workspaceId: z.string(),
  principal: PrincipalSchema,
  agentKey: z.string().regex(/^wk_[a-f0-9]{32}$/),
});

export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("northstar-edge"),
  environment: z.string(),
  correlationId: z.string(),
});

export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), correlationId: z.string() }),
});

export const initialOrchestratorState: OrchestratorState = {
  workspaceId: "northstar-demo",
  sourcesConnected: 3,
  connector: {
    id: "salesforce",
    label: "Salesforce agents",
    state: "not-configured",
    toolCount: 0,
    message: "The Salesforce MCP portal has not been configured for this environment.",
  },
  pendingConfirmation: null,
  tiles: [
    {
      id: "brief",
      kind: "campaign-brief",
      eyebrow: "Campaign brief",
      title: "Fall loyalty reactivation",
      summary: "A focused re-engagement idea for fictional Northstar members who have gone quiet.",
      state: "ready",
      source: {
        system: "salesforce",
        label: "Campaign · sample data",
        freshness: "2 min ago",
        status: "ready",
      },
      details: [
        "Audience: dormant loyalty members",
        "Channel: email",
        "Objective: repeat purchase",
      ],
      recordRef: {
        system: "salesforce",
        objectApiName: "Campaign",
        recordId: "701jV000004GglIQAS",
      },
    },
    {
      id: "readiness",
      kind: "readiness",
      eyebrow: "Readiness",
      title: "2 blockers before review",
      summary: "The proof agent found missing accessibility copy and an unconfirmed consent rule.",
      metric: "7 / 9",
      trend: "checks complete",
      state: "stale",
      source: {
        system: "data-360",
        label: "Data 360 · sample graph",
        freshness: "12 min ago",
        status: "stale",
      },
      details: ["Add image alt-text", "Confirm commercial consent scope"],
      recordRef: {
        system: "salesforce",
        objectApiName: "Campaign",
        recordId: "701jV000004GglIQAS",
      },
      presentation: {
        kind: "hxl",
        resourceUri: "ui://widget/lightningType/c__northstarCampaignReadinessOutput",
        sourceStatus: "deployed",
        fallback: "native",
      },
    },
    {
      id: "performance",
      kind: "performance",
      eyebrow: "Recent performance",
      title: "Engagement is holding",
      summary: "Sample campaign performance is above its fictional four-week baseline.",
      metric: "+8.4%",
      trend: "click-through rate",
      state: "ready",
      source: {
        system: "marketing-cloud-next",
        label: "Marketing Cloud Next · sample data",
        freshness: "5 min ago",
        status: "ready",
      },
      details: ["Open rate 38.2%", "Click rate 6.7%"],
    },
  ],
  activity: [
    {
      id: "a1",
      label: "Workspace opened",
      detail: "Server-authoritative proof session",
      occurredAt: "Now",
      status: "complete",
    },
    {
      id: "a2",
      label: "Sample sources checked",
      detail: "CRM, Marketing Cloud Next, Data 360",
      occurredAt: "Now",
      status: "complete",
    },
  ],
};
