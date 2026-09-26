import {
  CAMPAIGN_CONTEXT_TOOLS,
  type InsightTile,
  KNOWLEDGE_GRAPH_TOOLS,
  ORCHESTRATOR_TOOLS,
  READINESS_PRESENTATION,
  type RecordRef,
  recordKey,
  systemLabel,
  WORKSPACE_CATALOG,
  type WorkingRecord,
  type WorkingSet,
} from "../../../packages/contracts/src/index.ts";

/**
 * Builds the chat's working set from tool results. Everything here is deterministic: cards and
 * records come from what tools returned, never from model-written text, so nothing in the
 * workspace is invented.
 */

export const MAX_CARDS = 12;
export const MAX_RECORDS = 20;

type Payload = { data: Record<string, unknown> | null; text: string };
export type ToolResultEvent = { toolName: string; input: unknown; output: unknown; at: Date };

/** The orchestrator tool a prefixed key refers to, such as `graph_explain_buyer_group`. */
export function baseToolName(key: string): string | null {
  const names = [...ORCHESTRATOR_TOOLS].sort((a, b) => b.length - a.length);
  return names.find((name) => key === name || key.endsWith(`_${name}`)) ?? null;
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Reads an MCP tool result: structured content when present, otherwise its text parts. */
export function toolPayload(output: unknown): Payload {
  if (!output || typeof output !== "object") return { data: null, text: String(output ?? "") };
  const result = output as {
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
    semanticStatus?: string;
  };
  const text = (result.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  const structured =
    result.structuredContent && typeof result.structuredContent === "object"
      ? (result.structuredContent as Record<string, unknown>)
      : null;
  return { data: structured ?? parseJson(text), text };
}

const isFailure = (output: unknown) =>
  Boolean(
    output &&
      typeof output === "object" &&
      ("semanticStatus" in output ||
        (output as { isError?: boolean }).isError === true ||
        "error" in (toolPayload(output).data ?? {})),
  );

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const num = (value: unknown) => (typeof value === "number" ? value : undefined);
const list = (value: unknown) => (Array.isArray(value) ? value : []);
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
const titleCase = (name: string) =>
  name
    .replaceAll("_", " ")
    .replace(
      /([a-z])([A-Z])/g,
      (_, lower: string, upper: string) => `${lower} ${upper.toLowerCase()}`,
    )
    .replace(/^./, (first) => first.toUpperCase());

/** Bulleted or numbered lines from agent text, for card details. */
function bulletLines(text: string, max = 4) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line))
    .map((line) =>
      clip(
        line
          .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
          .replace(/\*\*|__|`/g, "")
          .trim(),
        120,
      ),
    )
    .filter(Boolean)
    .slice(0, max);
}

/** The first prose sentence or two of agent text, without Markdown decoration. */
function leadText(text: string) {
  const prose = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:[-*•|#]|\d+[.)])/.test(line))
    .join(" ")
    .replace(/\*\*|__|`/g, "");
  return clip(prose || text.replace(/\s+/g, " ").trim(), 220);
}

// Salesforce ids for the object types the workbench works with.
const SALESFORCE_ID = /\b((?:701|001|00T|003|00Q)[0-9A-Za-z]{12}(?:[0-9A-Za-z]{3})?)\b/g;
const SALESFORCE_OBJECT_BY_PREFIX: Record<string, string> = {
  "701": "Campaign",
  "001": "Account",
  "00T": "Task",
  "003": "Contact",
  "00Q": "Lead",
};

/** Salesforce records named in a tool's input or output: by id, or a catalog record by name. */
export function salesforceRecordsIn(text: string): Array<RecordRef & { title: string }> {
  const found = new Map<string, RecordRef & { title: string }>();
  for (const match of text.matchAll(SALESFORCE_ID)) {
    const id = match[1] ?? "";
    const catalog = WORKSPACE_CATALOG.find(
      (entry) => entry.system === "salesforce" && id.startsWith(entry.recordId.slice(0, 15)),
    );
    const objectType = SALESFORCE_OBJECT_BY_PREFIX[id.slice(0, 3)] ?? "Record";
    const ref = catalog ?? {
      system: "salesforce",
      objectType,
      recordId: id,
      title: `${objectType} ${id}`,
    };
    found.set(recordKey(ref), ref);
  }
  const lower = text.toLowerCase();
  for (const entry of WORKSPACE_CATALOG)
    if (entry.system === "salesforce" && lower.includes(entry.title.toLowerCase()))
      found.set(recordKey(entry), entry);
  return [...found.values()];
}

function record(
  ref: RecordRef & { title: string },
  via: string,
  at: Date,
  relation: WorkingRecord["relation"] = "read",
): WorkingRecord {
  return {
    ...ref,
    key: recordKey(ref),
    systemLabel: systemLabel(ref.system),
    relation,
    via,
    addedAt: at.toISOString(),
  };
}

type Ingested = { cards: InsightTile[]; records: WorkingRecord[] };

function weatherCard(data: Record<string, unknown>, tool: string, at: Date): Ingested {
  const weather = (data.weather ?? data) as Record<string, unknown>;
  const city = str(weather.city) ?? "California";
  const temperature = num(weather.temperatureF);
  const condition = str(weather.condition) ?? "unknown";
  return {
    cards: [
      {
        id: `weather:${city.toLowerCase().replace(/\W+/g, "-")}`,
        kind: "weather",
        eyebrow: "Weather",
        title: `${condition[0]?.toUpperCase()}${condition.slice(1)} in ${city}`,
        summary: `Feels like ${num(weather.feelsLikeF) ?? "?"}°F with ${num(weather.windMph) ?? "?"} mph wind; observed ${str(weather.observedAtLocal)?.replace("T", " ") ?? "just now"} local time.`,
        metric: temperature === undefined ? undefined : `${temperature}°F`,
        trend: weather.isDay === false ? "night" : "day",
        state: "ready",
        source: {
          system: "open-meteo",
          label: "Open-Meteo · live",
          freshness: "just now",
          status: "ready",
        },
        details: [`Precipitation ${num(weather.precipitationIn) ?? 0} in`],
        updatedAt: at.toISOString(),
        toolName: tool,
      },
    ],
    records: [],
  };
}

function restaurantCard(data: Record<string, unknown>, tool: string, at: Date): Ingested {
  const name = str(data.name) ?? "Restaurant";
  const id = str(data.id) ?? name.toLowerCase().replace(/\W+/g, "-");
  const location = (data.location ?? {}) as Record<string, unknown>;
  const favorites = list(data.favorites)
    .map((item) => (typeof item === "string" ? item : str((item as Record<string, unknown>)?.item)))
    .filter((item): item is string => Boolean(item));
  const menu = list(data.menu);
  return {
    cards: [
      {
        id: `restaurant:${id}`,
        kind: "restaurant",
        eyebrow: "Restaurant",
        title: name,
        summary: clip(str(data.concept) ?? "", 200),
        metric: menu.length ? String(menu.length) : undefined,
        trend: menu.length ? "menu items" : undefined,
        state: "ready",
        source: {
          system: "restaurant-data",
          label: "Restaurant data · mocked",
          freshness: "just now",
          status: "ready",
        },
        details: [
          str(data.hours),
          [str(location.neighborhood), str(location.city)].filter(Boolean).join(", "),
          favorites.length ? `Favorites: ${favorites.slice(0, 3).join(", ")}` : undefined,
        ].filter((detail): detail is string => Boolean(detail)),
        recordRef: { system: "restaurant-data", objectType: "Restaurant", recordId: id },
        updatedAt: at.toISOString(),
        toolName: tool,
      },
    ],
    records: [
      record(
        { system: "restaurant-data", objectType: "Restaurant", recordId: id, title: name },
        tool,
        at,
      ),
    ],
  };
}

const GRAPH_TITLES: Record<string, string> = {
  get_graph_overview: "Graph overview",
  explain_buyer_group: "Buyer group evidence",
  find_audience_overlap: "Audience overlap",
  check_consent_coverage: "Consent coverage",
  find_similar_past_pushes: "Similar past pushes",
  trace_content_lineage: "Content lineage",
};

function graphSummary(tool: string, data: Record<string, unknown>, count: number) {
  const pct = (value: unknown) =>
    typeof value === "number" ? `${Math.round(value * 1000) / 10}%` : "?";
  switch (tool) {
    case "find_similar_past_pushes":
      return `${num(data.totalSends) ?? 0} past sends in ${[data.location, data.daypart, data.condition].filter(Boolean).join(", ")}${str(data.bestAngle) ? `; best angle: ${data.bestAngle}` : ""}.`;
    case "check_consent_coverage":
      return `${num(data.covered) ?? 0} of ${num(data.audience) ?? 0} audience members covered for ${str(data.channel) ?? "the channel"} (${pct(data.coverageRate)}).`;
    case "explain_buyer_group":
      return `${count} recommended buyer-group members, each with an evidence path.`;
    case "find_audience_overlap":
      return `${count} other campaigns share members with this audience.`;
    case "trace_content_lineage":
      return `${count} content assets built from ${str(data.brief) ?? "the brief"}.`;
    default:
      return str(data.answer) ?? str(data.summary) ?? `${count} results`;
  }
}

function graphCard(
  data: Record<string, unknown>,
  tool: string,
  input: unknown,
  at: Date,
): Ingested {
  const paths = list(data.paths).length;
  const subject =
    str(data.account) ?? str(data.campaign) ?? str((input as Record<string, unknown>)?.account);
  const items = [
    ...list(data.candidates),
    ...list(data.overlaps),
    ...list(data.pushes),
    ...list(data.assets),
    ...list(data.uncoveredExamples),
    ...list(data.topItems),
  ]
    .map((item) => {
      if (typeof item === "string") return item;
      const row = (item ?? {}) as Record<string, unknown>;
      const rate = num(row.avgOrderRate);
      if (str(row.item) && rate !== undefined)
        return `${row.item} · ${(rate * 100).toFixed(1)}% order rate`;
      return (
        str(row.persona) ??
        str(row.campaign) ??
        str(row.name) ??
        str(row.title) ??
        str(row.menuItem) ??
        str(row.asset)
      );
    })
    .filter((item): item is string => Boolean(item));
  const title = GRAPH_TITLES[tool] ?? titleCase(tool);
  const inputKey = JSON.stringify(input ?? {})
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return {
    cards: [
      {
        id: `graph:${tool}:${clip(inputKey, 60)}`,
        kind: "graph",
        eyebrow: "Knowledge graph",
        title: subject ? `${title}: ${subject}` : title,
        summary: clip(graphSummary(tool, data, items.length), 200),
        metric: paths ? String(paths) : undefined,
        trend: paths ? "evidence paths" : undefined,
        state: "ready",
        source: {
          system: "knowledge-graph",
          label: data.source === "neo4j" ? "Neo4j · live" : "Knowledge graph · local copy",
          freshness: "just now",
          status: "ready",
        },
        details: [...new Set(items)].slice(0, 4),
        updatedAt: at.toISOString(),
        toolName: tool,
      },
    ],
    records: [],
  };
}

const SALESFORCE_CARDS: Record<string, { kind: InsightTile["kind"]; eyebrow: string }> = {
  summarize_campaign: { kind: "campaign-summary", eyebrow: "Campaign summary" },
  check_campaign_readiness: { kind: "readiness", eyebrow: "Readiness" },
  draft_campaign_content: { kind: "content-draft", eyebrow: "Content draft" },
  draft_campaign_brief: { kind: "campaign-brief", eyebrow: "Brief draft" },
  generate_campaign_insights: { kind: "performance", eyebrow: "Campaign insights" },
  recommend_buyer_group_members: { kind: "account-signals", eyebrow: "Buyer group" },
  summarize_account_engagement: { kind: "account-signals", eyebrow: "Account engagement" },
  get_account_marketing_signals: { kind: "account-signals", eyebrow: "Account signals" },
};

function salesforceCard(payload: Payload, tool: string, input: unknown, at: Date): Ingested {
  const mapping = SALESFORCE_CARDS[tool] ?? { kind: "context" as const, eyebrow: titleCase(tool) };
  const inputText = JSON.stringify(input ?? {});
  const refs = salesforceRecordsIn(`${inputText}\n${payload.text}`);
  const campaign = refs.find((ref) => ref.objectType === "Campaign");
  const text = payload.data ? JSON.stringify(payload.data) : payload.text;
  const structuredDetails = payload.data
    ? Object.entries(payload.data)
        .filter(
          ([key, value]) =>
            !["source", "summary", "campaignId"].includes(key) &&
            (typeof value === "string" || typeof value === "number"),
        )
        .map(([key, value]) => `${titleCase(key)}: ${value}`)
    : [];
  const details = [...bulletLines(payload.text), ...structuredDetails].slice(0, 4);
  return {
    cards: [
      {
        id: `salesforce:${tool}:${campaign?.recordId ?? "workspace"}`,
        kind: mapping.kind,
        eyebrow: mapping.eyebrow,
        title: campaign?.title ?? mapping.eyebrow,
        summary:
          leadText(payload.data ? (str(payload.data.summary) ?? payload.text) : payload.text) ||
          clip(text, 200),
        state: "ready",
        source: {
          system: "salesforce",
          label: /fixture/.test(str(payload.data?.source) ?? "")
            ? "Salesforce · local fixture"
            : "Salesforce agent",
          freshness: "just now",
          status: "ready",
        },
        details,
        ...(campaign
          ? {
              recordRef: {
                system: campaign.system,
                objectType: campaign.objectType,
                recordId: campaign.recordId,
              },
            }
          : {}),
        ...(tool === "check_campaign_readiness" ? { presentation: READINESS_PRESENTATION } : {}),
        updatedAt: at.toISOString(),
        toolName: tool,
      },
    ],
    records: refs.map((ref) => record(ref, tool, at)),
  };
}

/** What one tool result adds to the working set; unknown or failed results add nothing. */
export function ingestionFor(event: ToolResultEvent): Ingested {
  const tool = baseToolName(event.toolName);
  if (!tool || isFailure(event.output)) return { cards: [], records: [] };
  const payload = toolPayload(event.output);
  if ((CAMPAIGN_CONTEXT_TOOLS as readonly string[]).includes(tool)) {
    if (!payload.data) return { cards: [], records: [] };
    return tool === "get_current_weather"
      ? weatherCard(payload.data, tool, event.at)
      : restaurantCard(payload.data, tool, event.at);
  }
  if ((KNOWLEDGE_GRAPH_TOOLS as readonly string[]).includes(tool))
    return payload.data
      ? graphCard(payload.data, tool, event.input, event.at)
      : { cards: [], records: [] };
  if (!payload.text.trim() && !payload.data) return { cards: [], records: [] };
  return salesforceCard(payload, tool, event.input, event.at);
}

/** Adds cards (newest first, replacing a card with the same id) and records (deduplicated). */
export function mergeIntoWorkingSet(set: WorkingSet, added: Ingested, at: Date): WorkingSet {
  if (!added.cards.length && !added.records.length) return set;
  const cardIds = new Set(added.cards.map((card) => card.id));
  const cards = [...added.cards, ...set.cards.filter((card) => !cardIds.has(card.id))].slice(
    0,
    MAX_CARDS,
  );
  const records = [...set.records];
  for (const next of added.records) {
    const index = records.findIndex((existing) => existing.key === next.key);
    if (index === -1) records.unshift(next);
    // A record the chat created stays "created" even when it is read again later.
    else if (next.relation === "created")
      records[index] = { ...next, addedAt: records[index]?.addedAt ?? next.addedAt };
  }
  return {
    startedAt: set.startedAt ?? at.toISOString(),
    cards,
    records: records.slice(0, MAX_RECORDS),
  };
}

export const ingestToolResult = (set: WorkingSet, event: ToolResultEvent) =>
  mergeIntoWorkingSet(set, ingestionFor(event), event.at);

/** Adds a record the chat created through a confirmed write. */
export function addCreatedRecord(
  set: WorkingSet,
  ref: RecordRef & { title: string },
  via: string,
  at: Date,
): WorkingSet {
  return mergeIntoWorkingSet(set, { cards: [], records: [record(ref, via, at, "created")] }, at);
}

/** The Salesforce campaign the chat has open, most recent first: the target for writes. */
export const openCampaign = (set: WorkingSet) =>
  set.records.find((entry) => entry.system === "salesforce" && entry.objectType === "Campaign");

/** Prompt lines describing what's open in this chat and, separately, the catalog. */
export function workingSetPrompt(set: WorkingSet) {
  const open = set.records.map(
    (entry) =>
      `${entry.title} (${entry.systemLabel} ${entry.objectType} ${entry.recordId}, ${entry.relation === "created" ? "created in this chat" : "opened in this chat"})`,
  );
  const context = set.cards.map((card) => `${card.eyebrow}: ${card.title} [${card.source.label}]`);
  const openKeys = new Set(set.records.map((entry) => entry.key));
  const catalog = WORKSPACE_CATALOG.filter((entry) => !openKeys.has(recordKey(entry))).map(
    (entry) =>
      `${entry.title} (${systemLabel(entry.system)} ${entry.objectType} ${entry.recordId})`,
  );
  return [
    open.length
      ? `Records open in this chat: ${open.join("; ")}.`
      : "No records are open in this chat yet.",
    context.length ? `Context gathered in this chat: ${context.join("; ")}.` : "",
    catalog.length
      ? `Catalog of records available in connected systems (not open in this chat; never what "this" or "it" refers to unless the user names one): ${catalog.join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
