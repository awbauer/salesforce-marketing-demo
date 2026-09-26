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

/** A connected system: Salesforce is one of several (weather, restaurant data, the graph, …). */
export const SystemIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

export const SourceSchema = z.object({
  system: SystemIdSchema,
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
  /** The workspace focus version this write was confirmed for, when it acts on the focus. */
  focus: z
    .object({ id: z.string(), version: z.number().int().positive(), title: z.string() })
    .optional(),
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

/** Read-only tools served by the knowledge-graph MCP (Neo4j, or its fictional local copy). */
export const KNOWLEDGE_GRAPH_TOOLS = Object.freeze([
  "get_graph_overview",
  "explain_buyer_group",
  "find_audience_overlap",
  "check_consent_coverage",
  "find_similar_past_pushes",
  "trace_content_lineage",
] as const);

/** Every tool the orchestrator may call, for display names and operator kill switches. */
export const ORCHESTRATOR_TOOLS = Object.freeze([
  ...PHASE_2_CURATED_TOOLS,
  "update_focus",
  ...CAMPAIGN_CONTEXT_TOOLS,
  ...KNOWLEDGE_GRAPH_TOOLS,
] as const);

/** A record in any connected system, identified by system, object type, and id. */
export const RecordRefSchema = z.object({
  system: SystemIdSchema,
  objectType: z.string().min(1).max(80),
  recordId: z.string().min(1).max(120),
});
export type RecordRef = z.infer<typeof RecordRefSchema>;

export const recordKey = (ref: RecordRef) => `${ref.system}:${ref.objectType}:${ref.recordId}`;

export const InsightTileSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "campaign-brief",
    "readiness",
    "performance",
    "account-signals",
    "content-draft",
    "campaign-summary",
    "weather",
    "restaurant",
    "graph",
    "context",
  ]),
  title: z.string(),
  eyebrow: z.string(),
  summary: z.string(),
  metric: z.string().optional(),
  trend: z.string().optional(),
  state: z.enum(["ready", "loading", "empty", "error", "stale", "permission-denied"]),
  source: SourceSchema,
  details: z.array(z.string()),
  recordRef: RecordRefSchema.optional(),
  presentation: PortableTilePresentationSchema.optional(),
  /** When the data was fetched (ISO time); the UI shows it relative to now. */
  updatedAt: z.string().optional(),
  /** The tool that produced this card. */
  toolName: z.string().optional(),
});
export type InsightTile = z.infer<typeof InsightTileSchema>;

/** A record the chat has opened or created, in any connected system. */
export const WorkingRecordSchema = RecordRefSchema.extend({
  key: z.string(),
  title: z.string().min(1).max(200),
  systemLabel: z.string(),
  url: z.string().url().optional(),
  relation: z.enum(["read", "created", "updated"]),
  via: z.string(),
  addedAt: z.string(),
});
export type WorkingRecord = z.infer<typeof WorkingRecordSchema>;

/** What the chat is working on: a campaign, a brief, or a message draft. */
export const FocusKindSchema = z.enum(["campaign", "brief", "push-message", "email", "content"]);
export type FocusKind = z.infer<typeof FocusKindSchema>;

export const FocusFieldSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(1200),
});

export const FocusVersionSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().min(1).max(160),
  summary: z.string().max(600),
  fields: z.array(FocusFieldSchema).max(16),
  changeNote: z.string().max(240),
  /** Context cards the draft was built from, by card id. */
  basedOn: z.array(z.string()).max(12),
  createdAt: z.string(),
});
export type FocusVersion = z.infer<typeof FocusVersionSchema>;

/**
 * The focus: the one thing the chat is building, as structured data with every version kept.
 * Revisions, references to the draft, and confirmed saves all act on it.
 */
export const FocusItemSchema = z.object({
  id: z.string(),
  kind: FocusKindSchema,
  current: z.number().int().positive(),
  versions: z.array(FocusVersionSchema).min(1).max(20),
});
export type FocusItem = z.infer<typeof FocusItemSchema>;

export const FOCUS_KIND_LABELS: Record<FocusKind, string> = {
  campaign: "Campaign",
  brief: "Brief",
  "push-message": "Push message",
  email: "Email",
  content: "Content",
};

export const currentFocusVersion = (focus: FocusItem) =>
  focus.versions.find((version) => version.version === focus.current) ??
  (focus.versions.at(-1) as FocusVersion);

/**
 * The chat's working set: the records it has opened or created and the context its tools
 * returned. It is built from tool results by code, never from model-written text, and a new
 * chat starts it empty.
 */
export const WorkingSetSchema = z.object({
  startedAt: z.string().nullable(),
  focus: FocusItemSchema.nullable().default(null),
  cards: z.array(InsightTileSchema),
  records: z.array(WorkingRecordSchema),
});
export type WorkingSet = z.infer<typeof WorkingSetSchema>;

export const emptyWorkingSet = (): WorkingSet => ({
  startedAt: null,
  focus: null,
  cards: [],
  records: [],
});

/** Local tools that change only the workspace, never an external system. */
export const WORKSPACE_TOOLS = Object.freeze(["update_focus"] as const);

/** Systems the workbench connects to. Records from any of them can join the working set. */
export const CONNECTED_SYSTEMS: Readonly<Record<string, { label: string }>> = Object.freeze({
  salesforce: { label: "Salesforce" },
  "restaurant-data": { label: "Restaurant data" },
  "open-meteo": { label: "Open-Meteo" },
  "knowledge-graph": { label: "Knowledge graph" },
  "data-360": { label: "Data 360" },
  "marketing-cloud-next": { label: "Marketing Cloud Next" },
  cloudflare: { label: "Cloudflare" },
});

export const systemLabel = (system: string) => CONNECTED_SYSTEMS[system]?.label ?? system;

/**
 * Records the connected systems make available to this workspace. The model can open them by
 * name or id, but it acts on one only when the user asks for it or the chat opens it.
 */
export const WORKSPACE_CATALOG: ReadonlyArray<RecordRef & { title: string }> = Object.freeze([
  {
    system: "salesforce",
    objectType: "Campaign",
    recordId: "701jV000004GglIQAS",
    title: "Fall Loyalty Reactivation",
  },
]);

/** The deployed HXL card for campaign readiness results. */
export const READINESS_PRESENTATION = {
  kind: "hxl",
  resourceUri: "ui://widget/lightningType/c__northstarCampaignReadinessOutput",
  sourceStatus: "deployed",
  fallback: "native",
} as const satisfies PortableTilePresentation;

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
  workingSet: WorkingSetSchema,
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
    /\bsave\b[^.?!]*\b(?:campaign|brief|draft|this|it)\b|\bcreate\b[^.?!]*\breview (?:task|request)\b|\b(?:update|edit|change)\b[^.?!]*\b(?:salesforce|record)\b|\b(?:create|build|launch|schedule)\s+(?:it|this|that|them)(?:\s+(?:now|please|in salesforce|for real))?\s*[.!]*\s*$/i.test(
      affirmative,
    )
  )
    return "confirmation-required";
  return null;
}

/**
 * The policy reply for a write request, naming the draft it concerns: the workspace focus, or
 * the previous reply's title. The name is a label only, never treated as evidence.
 */
export function policyResponse(
  intent: "confirmation-required" | "unsupported",
  referent?: string | null,
) {
  if (!referent) return POLICY_RESPONSES[intent];
  return intent === "confirmation-required"
    ? `I can't create “${referent}” in Salesforce from chat, and nothing has been saved or created. This demo only writes through a confirmation step: in the Workspace, use Save to Salesforce as brief or Create review request, check the confirmation card, and confirm it yourself. I can keep refining the draft here.`
    : `I can't do that with “${referent}”: publishing, sending, activating, deleting, suppressing, changing buyer groups, and revealing audience contact details are blocked in this workbench, and I didn't take the action. I can keep refining the draft for review instead.`;
}

/** A title for the previous assistant reply: a heading, a fully bold first line, or a "Draft …" line. */
export function referentFromReply(text: string): string | null {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const isTitle =
    /^#{1,6}\s+\S/.test(firstLine) ||
    /^(\*\*|__)[^*_]+\1[:.]?$/.test(firstLine) ||
    /^(?:\*\*)?draft\b/i.test(firstLine);
  if (!isTitle) return null;
  const title = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*|__|[*_`]/g, "")
    .replace(/[.:!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return title.length >= 4 && title.length <= 90 ? title : null;
}

export const POLICY_RESPONSES = Object.freeze({
  "confirmation-required":
    "I can't save or change Salesforce records from chat, and nothing has been saved or created. Writes go through a confirmation step: use Create review request in the Workspace panel, check the confirmation card, and confirm it yourself. Salesforce then returns the created record for you to review.",
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
  /** Where knowledge-graph answers come from: live Neo4j or the fictional local copy. */
  knowledgeGraph: z.enum(["neo4j", "fixture"]).optional(),
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
  workingSet: emptyWorkingSet(),
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
