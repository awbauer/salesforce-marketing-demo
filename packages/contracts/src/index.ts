import { z } from "zod";

export const PROOF_DEFAULTS = Object.freeze({
  workspaceId: "northstar-demo",
  // The only place the orchestrator model is set; the Worker reads it from here. See ADR-005.
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
  action: z.enum(["save-draft-campaign", "create-review-task", "attach-generated-image"]),
  recordId: z.string().regex(/^[a-zA-Z0-9]{15,18}$/),
  imageId: z.string().uuid().optional(),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  principalSubject: z.string().min(1),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
  summary: z.string().min(1).max(500),
  expiresAt: z.string().datetime(),
  status: z.enum(["pending", "confirmed", "denied", "expired", "executed"]),
});
export type Confirmation = z.infer<typeof ConfirmationSchema>;

export const GeneratedCampaignImageSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().regex(/^[a-zA-Z0-9]{15,18}$/),
  imageUrl: z.string().startsWith("/agent/images/"),
  promptSummary: z.string().min(1).max(280),
  channel: z.enum(["email", "web", "social"]),
  width: z.literal(PROOF_DEFAULTS.imageSize),
  height: z.literal(PROOF_DEFAULTS.imageSize),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.literal(PROOF_DEFAULTS.imageModel),
  lifecycle: z.enum(["draft", "attached", "rejected"]),
  expiresAt: z.string().datetime(),
});
export type GeneratedCampaignImage = z.infer<typeof GeneratedCampaignImageSchema>;

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
  "attach_campaign_image",
] as const);

/** Read-only tools served by the campaign-context MCP (mocked restaurant profile and live weather). */
export const CAMPAIGN_CONTEXT_TOOLS = Object.freeze([
  "get_restaurant_profile",
  "get_current_weather",
] as const);

/** Every tool the orchestrator may call, for display names and operator kill switches. */
export const ORCHESTRATOR_TOOLS = Object.freeze([
  ...PHASE_2_CURATED_TOOLS,
  ...CAMPAIGN_CONTEXT_TOOLS,
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

/**
 * Chat requests that must never reach the model. Writes need the server-side confirmation flow,
 * and forbidden actions are refused outright. Negated requests such as "do not publish" are
 * ignored so drafting prompts still reach the model.
 */
export function classifyPolicyIntent(
  prompt: string,
): "confirmation-required" | "unsupported" | null {
  const affirmative = prompt.replace(
    /\b(?:do not|don't|dont|never|without|no)\s+(?:\w+\s+){0,2}?(?:publish|send|activate|delete|suppress|save|create|add|remove)(?:ing|s)?\b/gi,
    " ",
  );
  // Describing a future send ("an email to send next week") is drafting, not a request to act.
  const actionVerb =
    /(?<!\b(?:to|before|after|when|once|until|ready to|how to|plan to)\s)\b(?:publish|send|activate|delete|suppress|unsubscribe)\b/i;
  // Advisory questions ("When should we send it?") ask for guidance; "Can you send it?" is a request.
  const advisoryQuestion = /^\s*(?:when|how|what|why|which|should)\b[^.!]*\?\s*$/i.test(
    affirmative,
  );
  if (
    (actionVerb.test(affirmative) && !advisoryQuestion) ||
    /\b(?:add|remove|move)\b[^.?!]*\bbuyer group\b/i.test(affirmative) ||
    /\breveal\b|\bignore (?:the |all |any )?(?:policy|policies|rules|instructions)\b/i.test(
      affirmative,
    ) ||
    /\b(?:list|show|export|give me|share)\b[^.?!]*\b(?:email addresses|emails|phone numbers|contact details)\b/i.test(
      affirmative,
    )
  )
    return "unsupported";
  if (
    /\bsave\b[^.?!]*\b(?:campaign|brief|draft|this|it)\b|\bcreate\b[^.?!]*\breview (?:task|request)\b|\b(?:update|edit|change)\b[^.?!]*\b(?:salesforce|record)\b/i.test(
      affirmative,
    )
  )
    return "confirmation-required";
  return null;
}

export const POLICY_RESPONSES = Object.freeze({
  "confirmation-required":
    "I can't save or change Salesforce records from chat, and nothing has been saved or created. Writes go through a confirmation step: use Create review request in the Insights panel, check the confirmation card, and confirm it yourself. Salesforce then returns the created record for you to review.",
  unsupported:
    "That action isn't available in this workbench, and I didn't take it. Publishing, sending, activating, deleting, suppressing, changing buyer groups, and revealing audience contact details are all blocked. I can summarize the campaign, draft content for review, or check readiness instead.",
} as const);

export const TURN_TRACE_PART_TYPE = "data-turn-trace" as const;
export const TURN_TRACE_PART_ID = "turn-trace" as const;

export const TurnTraceEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("turn-start"),
    at: z.number(),
    model: z.string(),
    toolCount: z.number().int().nonnegative(),
    requiredTool: z.string().optional(),
    route: z
      .enum(["model", "confirmation-required", "unsupported", "catalog-unavailable"])
      .optional(),
  }),
  z.object({ kind: z.literal("step-start"), at: z.number(), step: z.number().int() }),
  z.object({
    kind: z.literal("step-finish"),
    at: z.number(),
    step: z.number().int(),
    finishReason: z.string(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    reasoningTokens: z.number().optional(),
  }),
  z.object({ kind: z.literal("reasoning-start"), at: z.number(), index: z.number().int() }),
  z.object({
    kind: z.literal("reasoning-end"),
    at: z.number(),
    index: z.number().int(),
    chars: z.number().int(),
  }),
  z.object({ kind: z.literal("text-start"), at: z.number(), index: z.number().int() }),
  z.object({
    kind: z.literal("text-end"),
    at: z.number(),
    index: z.number().int(),
    chars: z.number().int(),
  }),
  z.object({
    kind: z.literal("tool-input-start"),
    at: z.number(),
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  z.object({
    kind: z.literal("tool-input-available"),
    at: z.number(),
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  z.object({
    kind: z.literal("tool-input-error"),
    at: z.number(),
    toolCallId: z.string(),
    toolName: z.string(),
    message: z.string(),
  }),
  z.object({ kind: z.literal("tool-output-available"), at: z.number(), toolCallId: z.string() }),
  z.object({
    kind: z.literal("tool-output-error"),
    at: z.number(),
    toolCallId: z.string(),
    message: z.string(),
  }),
  z.object({ kind: z.literal("abort"), at: z.number(), reason: z.string() }),
  z.object({ kind: z.literal("error"), at: z.number(), message: z.string() }),
  z.object({ kind: z.literal("fallback-text"), at: z.number(), reason: z.string() }),
  z.object({
    kind: z.literal("turn-finish"),
    at: z.number(),
    outcome: z.enum(["completed", "aborted", "timed-out", "failed"]),
  }),
]);
export type TurnTraceEvent = z.infer<typeof TurnTraceEventSchema>;

export const TurnTraceSchema = z.object({
  startedAt: z.number(),
  events: z.array(TurnTraceEventSchema),
});
export type TurnTrace = z.infer<typeof TurnTraceSchema>;

export const WRITE_TOOL_BY_ACTION = Object.freeze({
  "save-draft-campaign": "save_campaign_brief",
  "create-review-task": "create_campaign_review_request",
  "attach-generated-image": "attach_campaign_image",
} as const);

export const OperationControlsSchema = z.object({
  writesEnabled: z.boolean(),
  disabledTools: z.array(z.enum(ORCHESTRATOR_TOOLS as unknown as [string, ...string[]])),
});
export type OperationControls = z.infer<typeof OperationControlsSchema>;

/**
 * Operator kill switches from Worker variables. Writes stay enabled unless WRITES_ENABLED is
 * exactly "false"; DISABLED_TOOLS is a comma-separated list, and unknown names are ignored.
 */
export function parseOperationControls(env: {
  WRITES_ENABLED?: string;
  DISABLED_TOOLS?: string;
}): OperationControls {
  const requested = (env.DISABLED_TOOLS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    writesEnabled: env.WRITES_ENABLED?.trim().toLowerCase() !== "false",
    disabledTools: ORCHESTRATOR_TOOLS.filter((tool) => requested.includes(tool)),
  };
}

export const TURN_HISTORY_RETENTION_DAYS = PROOF_DEFAULTS.transcriptRetentionDays;

export const TurnRecordSchema = z.object({
  id: z.string(),
  startedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  utterance: z.string(),
  model: z.string(),
  route: z.enum([
    "model",
    "confirmation-required",
    "unsupported",
    "catalog-unavailable",
    "local-fixture",
  ]),
  requiredTool: z.string().optional(),
  interpretation: z.string(),
  reasoning: z.string(),
  outcome: z.enum(["completed", "aborted", "timed-out", "failed"]),
  fallback: z.boolean(),
  failure: z.string().optional(),
  answer: z.string(),
  steps: z.number().int().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  tools: z.array(
    z.object({
      toolCallId: z.string(),
      toolName: z.string(),
      status: z.enum(["pending", "ok", "error"]),
      durationMs: z.number().nonnegative().optional(),
      input: z.unknown(),
      output: z.unknown(),
      error: z.string().optional(),
    }),
  ),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

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
      summary:
        "The readiness check found missing accessibility copy and an unconfirmed consent rule.",
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
      detail: "Server-authoritative demo session",
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
