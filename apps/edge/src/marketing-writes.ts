import { z } from "zod";
import {
  type Confirmation,
  currentFocusVersion,
  type FocusItem,
  MARKETING_BRIEF_FIELDS,
  type MarketingBrief,
  MarketingBriefSchema,
  type MarketingCampaign,
  type MarketingPreviewStep,
  type MarketingWrite,
  type PermissionReport,
  PermissionReportSchema,
  type WorkingSet,
} from "../../../packages/contracts/src/index.ts";
import type { FocusInput } from "./focus.ts";
import { addCreatedRecord } from "./working-set.ts";

/**
 * Marketing Cloud Next writes, done by the Campaign Creation agent. The workbench never creates
 * briefs or campaigns itself: after the user confirms, it asks the agent (through its Hosted
 * MCP tool) to run its standard actions, then reads the result back from Salesforce.
 *
 * 1. Save the brief: Save Campaign Brief, then Draft a Campaign Preview (Brief + BriefPlanStep).
 * 2. Create the campaign: Create Campaign, then Save Campaign (Campaign + campaign flow).
 */

export type MarketingAction = "save-marketing-brief" | "create-marketing-campaign";

export type PlannedMarketingWrite = {
  action: MarketingAction;
  /** The confirmation subject: "new" for a brief, the brief id for a campaign. */
  recordId: string;
  write: MarketingWrite;
  summary: string;
};

const clip = (value: string | undefined, max: number) =>
  value === undefined ? undefined : value.length > max ? `${value.slice(0, max - 1)}…` : value;

function field(focus: FocusItem, pattern: RegExp) {
  return currentFocusVersion(focus).fields.find((entry) => pattern.test(entry.label.trim()))?.value;
}

/**
 * The focus as the brief Save Campaign Brief takes. A brief the agent drafted maps field for
 * field; another draft (an email or push, say) becomes a brief whose key message and audience
 * come from the draft, so the agent's preview is built from what the user reviewed.
 */
export function briefFromFocus(focus: FocusItem): MarketingBrief {
  const current = currentFocusVersion(focus);
  const pick = (pattern: RegExp, max = 2000) => clip(field(focus, pattern), max);
  const copy = [
    pick(/^(key message|headline|subject( line)?)$/i),
    pick(/^(body|message|copy|content|paragraph)$/i),
  ].filter(Boolean);
  const channel = pick(/^channel$/i);
  const guardrails = [
    pick(/^agent guardrails?$/i),
    channel && !/email/i.test(channel) ? `Requested channel: ${channel}.` : undefined,
  ].filter(Boolean);
  return MarketingBriefSchema.parse({
    name: clip(pick(/^(name|brief name|campaign name)$/i) ?? current.title, 80),
    description: pick(/^description$/i) ?? (clip(current.summary, 2000) || current.title),
    keyMessage: copy[0] ?? (clip(current.summary, 2000) || current.title),
    targetAudience:
      pick(/^(target audience|audience)$/i) ??
      "The audience described in the draft; confirm in Marketing Cloud.",
    ...(pick(/^(primary goal|goal|objective)$/i)
      ? { primaryGoal: pick(/^(primary goal|goal|objective)$/i) }
      : {}),
    ...(pick(/^(primary ctas?|primary calls?[- ]to[- ]actions?|ctas?|call to action)$/i)
      ? {
          primaryCtas: pick(
            /^(primary ctas?|primary calls?[- ]to[- ]actions?|ctas?|call to action)$/i,
          ),
        }
      : {}),
    ...(pick(/^(primary kpi|kpi)$/i) ? { primaryKpi: pick(/^(primary kpi|kpi)$/i) } : {}),
    ...(guardrails.length ? { agentGuardrails: guardrails.join(" ") } : {}),
    ...(pick(/^priority$/i) ? { priority: pick(/^priority$/i) } : {}),
  });
}

/**
 * What saving the focus means now: a new brief (nothing saved yet, or the brief text changed
 * since it was saved), or the campaign from the saved brief. Null once the campaign exists.
 */
export function planMarketingWrite(focus: FocusItem): PlannedMarketingWrite | null {
  const current = currentFocusVersion(focus);
  const saved = focus.saved?.objectType === "Brief" ? focus.saved : undefined;
  if (saved && saved.version === focus.current) {
    if (saved.campaign) return null;
    const briefName = clip(current.title, 80) as string;
    return {
      action: "create-marketing-campaign",
      recordId: saved.recordId,
      write: { kind: "campaign", briefId: saved.recordId, briefName },
      summary: `Ask the Marketing Cloud Campaign Creation agent to create the campaign and its flow from the brief "${briefName}" and its ${saved.preview?.length ?? 0}-step preview. Nothing is sent or activated.`,
    };
  }
  const brief = briefFromFocus(focus);
  return {
    action: "save-marketing-brief",
    recordId: "new",
    write: { kind: "brief", brief },
    summary: `Ask the Marketing Cloud Campaign Creation agent to save the brief "${brief.name}" from version ${current.version} of the draft, then draft its campaign preview. Nothing is sent or activated.`,
  };
}

/** The request the workbench sends the Campaign Creation agent for a confirmed write. */
export function agentRequest(write: MarketingWrite) {
  if (write.kind === "brief")
    return [
      "The user reviewed and confirmed this campaign brief in the Northstar workbench.",
      "Save it exactly as written with Save Campaign Brief, then draft its campaign preview with Draft a Campaign Preview.",
      "Do not create or save the campaign yet. In your reply, include the Brief ID.",
      ...MARKETING_BRIEF_FIELDS.flatMap(([key, label]) =>
        write.brief[key] ? [`${label}: ${write.brief[key]}`] : [],
      ),
    ].join("\n");
  return [
    `The user reviewed and confirmed the campaign preview already saved on brief ${write.briefId} ("${write.briefName}") in the Northstar workbench.`,
    "Create the campaign for that brief with Create Campaign, then save it with Save Campaign.",
    "Do not activate, schedule, or send anything. In your reply, include the Campaign ID.",
  ].join("\n");
}

/** Every text part of an MCP tool result, joined. */
export function toolText(output: unknown): string {
  if (typeof output === "string") return output;
  if (!output || typeof output !== "object") return "";
  const content = (output as { content?: Array<{ text?: unknown }> }).content;
  const parts = Array.isArray(content)
    ? content.map((part) => (typeof part.text === "string" ? part.text : ""))
    : [];
  const structured = (output as { structuredContent?: unknown }).structuredContent;
  return [...parts, structured ? JSON.stringify(structured) : ""].filter(Boolean).join("\n");
}

/** Record ids the agent named in its reply, by key prefix: Brief (21y) and Campaign (701). */
export function idsFromAgentReply(text: string) {
  const first = (prefix: string) =>
    text.match(new RegExp(`\\b(${prefix}[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\\b`))?.[1];
  return { briefId: first("21y"), campaignId: first("701") };
}

export type MarketingReadBack = {
  brief: (MarketingBrief & { id: string }) | null;
  steps: MarketingPreviewStep[];
  campaign: MarketingCampaign | null;
};

function findKey(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (key in value) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

/** A preview step's content JSON (subject line, preheader, paragraph) as plain fields. */
function stepContent(content: unknown) {
  if (typeof content !== "string") return {};
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      subject: text(parsed.subjectLine ?? parsed.subject ?? parsed.title, 500),
      preheader: text(parsed.preheader, 500),
      body: text(parsed.paragraph ?? parsed.body ?? parsed.message ?? parsed.text, 4000),
    };
  } catch {
    return { body: text(content, 4000) };
  }
}

const normalized = (value: string | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Whether a brief in Marketing Cloud is the one a save would create: the same name and key
 * message. Used to link an earlier attempt's brief instead of saving a duplicate.
 */
export function sameBrief(
  saved: Pick<MarketingBrief, "name" | "keyMessage">,
  brief: MarketingBrief,
) {
  return (
    normalized(saved.name) === normalized(brief.name) &&
    normalized(saved.keyMessage) === normalized(brief.keyMessage)
  );
}

/** Parses get_marketing_records: the Brief, its preview steps, and its Campaign and flow. */
export function parseMarketingReadBack(output: unknown): MarketingReadBack | null {
  let recordsJson = findKey(output, "recordsJson");
  if (recordsJson === undefined) {
    try {
      recordsJson = findKey(JSON.parse(toolText(output)), "recordsJson");
    } catch {
      return null;
    }
  }
  if (typeof recordsJson !== "string") return null;
  let records: Record<string, unknown>;
  try {
    records = JSON.parse(recordsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  const brief = records.brief as Record<string, unknown> | null;
  if (!brief || typeof brief.id !== "string") return { brief: null, steps: [], campaign: null };
  const steps = (Array.isArray(records.steps) ? records.steps : []).slice(0, 12).map((raw) => {
    const step = raw as Record<string, unknown>;
    return {
      stepNumber: Number(step.stepNumber ?? 0),
      stepType: String(step.stepType ?? "Message"),
      channel: typeof step.channel === "string" ? step.channel : null,
      waitNumber: typeof step.waitNumber === "number" ? step.waitNumber : null,
      waitUnit: typeof step.waitUnit === "string" ? step.waitUnit : null,
      ...stepContent(step.content),
    };
  });
  const campaign = records.campaign as Record<string, unknown> | null;
  const flow = records.flow as Record<string, unknown> | null;
  return {
    brief: {
      id: brief.id,
      name: String(brief.name ?? ""),
      description: String(brief.description ?? ""),
      keyMessage: String(brief.keyMessage ?? ""),
      targetAudience: String(brief.targetAudience ?? ""),
    },
    steps,
    campaign:
      campaign && typeof campaign.id === "string"
        ? {
            id: campaign.id,
            name: String(campaign.name ?? ""),
            stage: typeof campaign.stage === "string" ? campaign.stage : null,
            flow:
              flow && typeof flow.apiName === "string"
                ? {
                    apiName: flow.apiName,
                    label: String(flow.label ?? flow.apiName),
                    versionId: typeof flow.versionId === "string" ? flow.versionId : null,
                    active: flow.active === true,
                  }
                : null,
          }
        : null,
  };
}

/** Reads the check_write_access result: allowed, the user, and each check. */
export function parsePermissionReport(output: unknown, at: Date): PermissionReport | null {
  const find = (key: string): unknown => {
    const direct = findKey(output, key);
    if (direct !== undefined) return direct;
    try {
      return findKey(JSON.parse(toolText(output)), key);
    } catch {
      return undefined;
    }
  };
  const checksJson = find("checksJson");
  try {
    const checks = typeof checksJson === "string" ? JSON.parse(checksJson) : checksJson;
    return PermissionReportSchema.parse({
      source: "salesforce",
      user: String(find("userName") ?? "Salesforce user"),
      allowed: find("allowed") === true,
      checkedAt: at.toISOString(),
      checks,
    });
  } catch {
    return null;
  }
}

/** Local development's permission report: the same checks, marked as a fixture. */
export function fixturePermissionReport(
  action: Confirmation["action"],
  at: Date,
): PermissionReport {
  const checks = [
    {
      label: "Workbench permission set",
      detail: "Northstar Marketing Workbench Evaluator is assigned.",
    },
    ...(action === "save-marketing-brief"
      ? [
          { label: "Create Brief", detail: "Allowed by your profile and permission sets." },
          {
            label: "Create Brief Plan Step",
            detail: "Allowed by your profile and permission sets.",
          },
        ]
      : action === "create-marketing-campaign"
        ? [
            { label: "Marketing User", detail: "Can create and edit campaigns." },
            { label: "Create Campaign", detail: "Allowed by your profile and permission sets." },
            { label: "Edit this brief", detail: "Sharing gives you edit access to the record." },
          ]
        : action === "create-inventory-case"
          ? [
              { label: "Create Case", detail: "Allowed by your profile and permission sets." },
              { label: "Read Contact", detail: "You can see the store manager's contact." },
            ]
          : [
              {
                label: `Create ${action === "create-review-task" ? "Task" : "Content Version"}`,
                detail: "Allowed by your profile and permission sets.",
              },
            ]),
  ].map((check) => ({ ...check, passed: true }));
  return {
    source: "local-fixture",
    user: "Local evaluator",
    allowed: true,
    checkedAt: at.toISOString(),
    checks,
  };
}

/** The working set after a confirmed, read-back Marketing Cloud write. */
export function applyMarketingWrite(
  set: WorkingSet,
  confirmation: Confirmation,
  readBack: MarketingReadBack,
  at: Date,
): WorkingSet {
  const brief = readBack.brief;
  if (!brief) return set;
  const tool =
    confirmation.action === "save-marketing-brief"
      ? "save_marketing_brief"
      : "create_marketing_campaign";
  let next = addCreatedRecord(
    set,
    { system: "salesforce", objectType: "Brief", recordId: brief.id, title: brief.name },
    tool,
    at,
    confirmation.action === "save-marketing-brief" ? "created" : "updated",
  );
  const campaign = readBack.campaign;
  if (confirmation.action === "create-marketing-campaign" && campaign) {
    next = addCreatedRecord(
      next,
      { system: "salesforce", objectType: "Campaign", recordId: campaign.id, title: campaign.name },
      tool,
      at,
    );
    if (campaign.flow)
      next = addCreatedRecord(
        next,
        {
          system: "salesforce",
          objectType: "Flow",
          recordId: campaign.flow.versionId ?? campaign.flow.apiName,
          title: campaign.flow.label,
        },
        tool,
        at,
      );
  }
  const focus = next.focus;
  if (focus && confirmation.focus?.id === focus.id)
    next = {
      ...next,
      focus: {
        ...focus,
        saved: {
          objectType: "Brief",
          recordId: brief.id,
          version: confirmation.focus.version,
          preview: readBack.steps,
          ...(campaign ? { campaignId: campaign.id, campaign } : {}),
        },
      },
    };
  return next;
}

/** After a preview refinement: the refreshed preview steps on the saved brief. */
export function withRefreshedPreview(set: WorkingSet, readBack: MarketingReadBack): WorkingSet {
  const focus = set.focus;
  if (!focus?.saved || focus.saved.recordId !== readBack.brief?.id) return set;
  return { ...set, focus: { ...focus, saved: { ...focus.saved, preview: readBack.steps } } };
}

const BRIEF_LABELS = new Map<string, string>(
  MARKETING_BRIEF_FIELDS.map(([, label]) => [label.toLowerCase(), label]),
);
BRIEF_LABELS.set("primary calls-to-action", "Primary CTAs");
BRIEF_LABELS.set("primary calls to action", "Primary CTAs");

/**
 * The turn's answer when the model wrote none after the Campaign Creation agent drafted a
 * brief: the brief's own fields, so the chat still says what was drafted.
 */
export function briefAnswer(focus: FocusItem | null): string | null {
  if (focus?.kind !== "brief") return null;
  const lines = (
    [
      ["Key message", /^(key message)$/i],
      ["Target audience", /^(target audience|audience)$/i],
      ["Primary goal", /^(primary goal|goal|objective)$/i],
      ["Primary CTAs", /^(primary ctas?|ctas?)$/i],
      ["Primary KPI", /^(primary kpi|kpi)$/i],
    ] as const
  ).flatMap(([label, pattern]) => {
    const value = clip(field(focus, pattern)?.trim(), 400);
    return value ? [`- **${label}:** ${value}`] : [];
  });
  return [
    `The Marketing Cloud Campaign Creation agent drafted **${currentFocusVersion(focus).title}**.`,
    ...(lines.length ? ["", ...lines] : []),
    "",
    "The full brief is in the workspace. Nothing is saved in Marketing Cloud until you confirm the save.",
  ].join("\n");
}

/**
 * A brief the Campaign Creation agent drafted (its "Name: … / Description: …" lines) as focus
 * input, so the workspace holds the agent's brief rather than a model paraphrase of it.
 */
export function briefFocusFromAgent(reply: string, changeNote: string): FocusInput | null {
  const fields: FocusInput["fields"] = [];
  for (const raw of reply.split("\n")) {
    const match = raw
      .replace(/\*\*|__/g, "")
      .match(/^\s*(?:[-*•]\s*)?([A-Za-z][A-Za-z -]{2,40}):\s*(.+?)\s*$/);
    const label = match ? BRIEF_LABELS.get(match[1].trim().toLowerCase()) : undefined;
    if (label && match && !fields.some((entry) => entry.label === label))
      fields.push({ label, value: match[2].slice(0, 1200) });
  }
  const name = fields.find((entry) => entry.label === "Name")?.value;
  if (!name || fields.length < 3) return null;
  return {
    kind: "brief",
    title: name.slice(0, 160),
    summary: (fields.find((entry) => entry.label === "Description")?.value ?? "").slice(0, 600),
    // The name is the title and the description is the summary; the rest are fields.
    fields: fields.filter((entry) => entry.label !== "Name" && entry.label !== "Description"),
    changeNote,
  };
}

/** A tool's input schema as JSON Schema: the Agents SDK holds a Zod schema, the AI SDK a wrapper. */
async function inputJsonSchema(inputSchema: unknown): Promise<unknown> {
  if (inputSchema instanceof z.ZodType) return z.toJSONSchema(inputSchema, { io: "input" });
  if (inputSchema && typeof inputSchema === "object" && "jsonSchema" in inputSchema)
    return await (inputSchema as { jsonSchema: unknown }).jsonSchema;
  return inputSchema;
}

/**
 * The arguments for an agent-backed MCP tool: the request goes in the tool's text parameter,
 * whatever the Hosted MCP names it, read from the tool's own input schema.
 */
export async function agentToolInput(tool: { inputSchema?: unknown }, message: string) {
  let resolved: unknown;
  try {
    resolved = await inputJsonSchema(tool.inputSchema);
  } catch {
    resolved = undefined;
  }
  const schema = (resolved && typeof resolved === "object" ? resolved : {}) as {
    properties?: unknown;
    required?: unknown;
  };
  const properties = (
    schema.properties && typeof schema.properties === "object" ? schema.properties : {}
  ) as Record<string, { type?: unknown } | undefined>;
  const isString = (type: unknown) =>
    type === "string" || (Array.isArray(type) && type.includes("string"));
  const strings = Object.keys(properties).filter((name) => isString(properties[name]?.type));
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : [];
  // Parameter names only, never values: the record of what the Hosted MCP tool expects.
  console.log(
    `[marketing] agent tool input: properties=${Object.keys(properties).join(",") || "none"} required=${required.join(",") || "none"}`,
  );
  const key =
    required.find((name) => strings.includes(name)) ??
    strings.find((name) => /message|input|utterance|prompt|query|text/i.test(name)) ??
    strings[0] ??
    "message";
  return { [key]: message };
}

/**
 * Local development's stand-in for the Campaign Creation agent: it "saves" the brief with a
 * two-email preview, or "creates" the campaign and its draft flow, and replies with the ids the
 * way the agent does. Records live only in this agent instance.
 */
export function localAgentWrite(
  write: MarketingWrite,
  store: Map<string, MarketingReadBack>,
): string {
  if (write.kind === "brief") {
    const id = `21y000000000${String(store.size + 1).padStart(3, "0")}`;
    store.set(id, {
      brief: { id, ...write.brief },
      steps: [
        {
          stepNumber: 1,
          stepType: "Message",
          channel: "EMAIL",
          waitNumber: 0,
          waitUnit: "Days",
          subject: write.brief.keyMessage.slice(0, 120),
          preheader: write.brief.name,
          body: write.brief.description,
        },
        {
          stepNumber: 2,
          stepType: "Message",
          channel: "EMAIL",
          waitNumber: 2,
          waitUnit: "Days",
          subject: `Reminder: ${write.brief.name}`.slice(0, 120),
          preheader: write.brief.keyMessage.slice(0, 120),
          body: write.brief.description,
        },
      ],
      campaign: null,
    });
    return `The brief is saved and a campaign preview has been generated (local fixture).\n\nBrief ID: ${id}`;
  }
  const saved = store.get(write.briefId);
  if (!saved?.brief) return "I couldn't find that brief.";
  const campaignId = `701000000000${write.briefId.slice(-3)}`;
  store.set(write.briefId, {
    ...saved,
    campaign: {
      id: campaignId,
      name: write.campaignName ?? `${saved.brief.name} Campaign`,
      stage: "In Planning",
      flow: {
        apiName: `flow_${campaignId}_local`,
        label: `${write.campaignName ?? `${saved.brief.name} Campaign`} Flow`,
        versionId: `301000000000${write.briefId.slice(-3)}`,
        active: false,
      },
    },
  });
  return `Your campaign has been created and saved (local fixture).\n\nCampaign ID: ${campaignId}`;
}

type ExecutableTool = { execute?: (input: never, options: never) => unknown };

/**
 * Makes every Refine Campaign Preview request name the saved brief. The model often leaves the
 * Brief ID out, and the Campaign Creation agent then has to guess which brief to change; the
 * server knows it, so it adds it when the request doesn't already contain it.
 */
export function pinBriefToRefinement<T extends Record<string, unknown>>(
  tools: T,
  briefId: string | undefined,
): T {
  if (!briefId) return tools;
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const execute = (definition as ExecutableTool).execute;
      if (!/(?:^|_)refine_campaign_preview$/.test(name) || typeof execute !== "function")
        return [name, definition];
      return [
        name,
        {
          ...(definition as object),
          execute: (input: Record<string, unknown>, options: unknown) => {
            const text = JSON.stringify(input ?? {});
            if (text.includes(briefId)) return execute(input as never, options as never);
            const key =
              Object.keys(input ?? {}).find((field) => typeof input[field] === "string") ??
              "message";
            return execute(
              {
                ...input,
                [key]:
                  `Refine the campaign preview on brief ${briefId}: ${String(input?.[key] ?? "")}`.trim(),
              } as never,
              options as never,
            );
          },
        },
      ];
    }),
  ) as T;
}
