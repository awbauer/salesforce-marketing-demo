import { z } from "zod";
import { RESTAURANT_BRAND, WEALTH_BRAND } from "../../contracts/src/brands.ts";
import { INSTANCE_PACK } from "../../contracts/src/generated/instance.ts";
import {
  ACCOUNTS,
  ALL_CAMPAIGNS,
  CHANNELS,
  CONDITIONS,
  consentScopeFor,
  DATASET_VERSION,
  type Dataset,
  type GraphNode,
  LOCATIONS,
} from "./dataset.ts";
import type { MemoryStore } from "./memory.ts";
import { DAYPARTS } from "./restaurant.ts";
import {
  CLIENT_NAMES,
  DEAL,
  DEAL_IDS,
  MARKET_EVENT_IDS,
  MARKET_EVENTS,
  marketEventId,
} from "./wealth.ts";

export type Row = Record<string, unknown>;
export type PathNode = { id: string; label: string; name: string };
export type PathRelationship = { type: string; from: string; to: string };
export type EvidencePath = { nodes: PathNode[]; relationships: PathRelationship[] };

/**
 * Runs graph statements. `query` is always read-only; `write` is used only by the server's fixed
 * long-term memory statements. The fixture backend keeps memory in an in-process store.
 */
export type GraphBackend =
  | {
      kind: "neo4j";
      query: (statement: string, parameters: Row) => Promise<Row[]>;
      write?: (statement: string, parameters: Row) => Promise<Row[]>;
    }
  | { kind: "fixture"; dataset: Dataset; memory?: MemoryStore };

const MAX_PATHS = 25;
const CAMPAIGN_IDS = ALL_CAMPAIGNS.map((campaign) => campaign.id) as [string, ...string[]];
const LOCATION_IDS = LOCATIONS.map((location) => location.id) as [string, ...string[]];
const campaignHelp = ALL_CAMPAIGNS.map((campaign) => `${campaign.id} (${campaign.name})`).join(
  ", ",
);

// ---------------------------------------------------------------------------------------------
// Fixture index: a tiny in-memory traversal layer over the same dataset that seeds Neo4j.

type Index = ReturnType<typeof indexDataset>;
const indexCache = new WeakMap<Dataset, Index>();

function indexDataset(dataset: Dataset) {
  const byId = new Map(dataset.nodes.map((node) => [node.id, node]));
  const out = new Map<string, Dataset["relationships"]>();
  const into = new Map<string, Dataset["relationships"]>();
  for (const relationship of dataset.relationships) {
    out.set(relationship.from, [...(out.get(relationship.from) ?? []), relationship]);
    into.set(relationship.to, [...(into.get(relationship.to) ?? []), relationship]);
  }
  const outgoing = (id: string, type: string) =>
    (out.get(id) ?? []).filter((relationship) => relationship.type === type);
  const incoming = (id: string, type: string) =>
    (into.get(id) ?? []).filter((relationship) => relationship.type === type);
  const node = (id: string) => byId.get(id) as GraphNode;
  return { byId, outgoing, incoming, node, relationships: dataset.relationships };
}

function index(dataset: Dataset) {
  let cached = indexCache.get(dataset);
  if (!cached) {
    cached = indexDataset(dataset);
    indexCache.set(dataset, cached);
  }
  return cached;
}

// Java/Cypher string order compares UTF-16 code units, which is JavaScript's default order.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pathNode = (node: { id: string; label: string; name: string }): PathNode => ({
  id: node.id,
  label: node.label,
  name: node.name,
});

function audienceOf(ix: Index, campaignId: string) {
  const personas = new Map<string, GraphNode>();
  for (const target of ix.outgoing(campaignId, "TARGETS"))
    for (const include of ix.outgoing(target.to, "INCLUDES"))
      personas.set(include.to, ix.node(include.to));
  return [...personas.values()].sort((a, b) => byText(a.name, b.name));
}

// ---------------------------------------------------------------------------------------------
// Tool definitions. Each has Cypher for Neo4j and an equivalent fixture implementation that
// returns identical rows; `present` turns rows into the tool result with evidence paths.

type ToolSpec<Input extends z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  input: Input;
  run: (backend: GraphBackend, input: z.infer<Input>) => Promise<Row>;
};

function define<Input extends z.ZodObject>(spec: ToolSpec<Input>) {
  return spec;
}

async function rows(
  backend: GraphBackend,
  statement: string,
  parameters: Row,
  fixture: (ix: Index) => Row[],
) {
  return backend.kind === "neo4j"
    ? backend.query(statement, { ...parameters, dataset: DATASET_VERSION })
    : fixture(index(backend.dataset));
}

export const OVERVIEW_CYPHER = `
MATCH (n {dataset: $dataset})
WITH labels(n)[0] AS label, count(*) AS count ORDER BY label
WITH collect({label: label, count: count}) AS nodeCounts
CALL () {
  MATCH ({dataset: $dataset})-[r]->()
  WITH type(r) AS type, count(*) AS count ORDER BY type
  RETURN collect({type: type, count: count}) AS relationshipCounts
}
RETURN nodeCounts, relationshipCounts`;

const getGraphOverview = define({
  name: "get_graph_overview",
  title: "Knowledge graph overview",
  description:
    "Summarize what the Workbench marketing knowledge graph contains: node counts by label, relationship counts by type, and the dataset version. All data is fictional.",
  input: z.object({}),
  run: async (backend) => {
    const [row] = await rows(backend, OVERVIEW_CYPHER, {}, (ix) => {
      const count = (values: string[]) => {
        const counts = new Map<string, number>();
        for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
        return [...counts.entries()].sort(([a], [b]) => byText(a, b));
      };
      return [
        {
          nodeCounts: count([...ix.byId.values()].map((node) => node.label)).map(
            ([label, value]) => ({
              label,
              count: value,
            }),
          ),
          relationshipCounts: count(ix.relationships.map((relationship) => relationship.type)).map(
            ([type, value]) => ({ type, count: value }),
          ),
        },
      ];
    });
    return { dataset: DATASET_VERSION, ...row, paths: [] };
  },
});

export const BUYER_GROUP_CYPHER = `
MATCH (a:Account {name: $account, dataset: $dataset})<-[:WORKS_AT]-(p:Persona)
CALL (p) {
  OPTIONAL MATCH (p)-[e:ENGAGED_WITH]->(c:ContentAsset)<-[:USES]-(camp:Campaign)
  WITH e, c, camp ORDER BY e.count DESC, c.name
  RETURN sum(coalesce(e.count, 0)) AS engagements,
    collect(CASE WHEN c IS NULL THEN NULL ELSE {assetId: c.id, asset: c.name, campaignId: camp.id, campaign: camp.name, count: e.count} END)[0..3] AS touches
}
RETURN a.id AS accountId, a.name AS account, p.id AS personaId, p.name AS persona, p.role AS role,
  p.roleWeight + engagements AS score, engagements, touches
ORDER BY score DESC, persona
LIMIT $limit`;

const explainBuyerGroup = define({
  name: "explain_buyer_group",
  title: "Explain buyer group candidates",
  description:
    "Rank an account's buying-role personas as buyer group candidates, with the evidence path for each: the role and the content they engaged with, by campaign. Read-only; never adds anyone to a buyer group.",
  input: z.object({
    account: z.enum(ACCOUNTS).describe("Fictional account name"),
    limit: z.number().int().min(1).max(10).default(5).describe("Candidates to return"),
  }),
  run: async (backend, { account, limit }) => {
    const result = await rows(backend, BUYER_GROUP_CYPHER, { account, limit }, (ix) => {
      const accountNode = [...ix.byId.values()].find(
        (node) => node.label === "Account" && node.name === account,
      );
      if (!accountNode) return [];
      return ix
        .incoming(accountNode.id, "WORKS_AT")
        .map(({ from }) => ix.node(from))
        .map((persona) => {
          const touches = ix
            .outgoing(persona.id, "ENGAGED_WITH")
            .flatMap((engagement) =>
              ix.incoming(engagement.to, "USES").map((use) => ({
                assetId: engagement.to,
                asset: ix.node(engagement.to).name,
                campaignId: use.from,
                campaign: ix.node(use.from).name,
                count: Number(engagement.properties?.count ?? 0),
              })),
            )
            .sort((a, b) => b.count - a.count || byText(a.asset, b.asset));
          const engagements = touches.reduce((sum, touch) => sum + touch.count, 0);
          return {
            accountId: accountNode.id,
            account: accountNode.name,
            personaId: persona.id,
            persona: persona.name,
            role: persona.role,
            score: Number(persona.roleWeight) + engagements,
            engagements,
            touches: touches.slice(0, 3),
          };
        })
        .sort((a, b) => b.score - a.score || byText(a.persona, b.persona))
        .slice(0, limit);
    });
    const candidates = result as Array<{
      accountId: string;
      account: string;
      personaId: string;
      persona: string;
      role: string;
      score: number;
      engagements: number;
      touches: Array<{
        assetId: string;
        asset: string;
        campaignId: string;
        campaign: string;
        count: number;
      }>;
    }>;
    const paths: EvidencePath[] = candidates.flatMap((candidate) => {
      const persona = { id: candidate.personaId, label: "Persona", name: candidate.persona };
      const accountNode = { id: candidate.accountId, label: "Account", name: candidate.account };
      const role: EvidencePath = {
        nodes: [persona, accountNode],
        relationships: [{ type: "WORKS_AT", from: persona.id, to: accountNode.id }],
      };
      const touchPaths = candidate.touches.slice(0, 2).map((touch) => ({
        nodes: [
          persona,
          { id: touch.assetId, label: "ContentAsset", name: touch.asset },
          { id: touch.campaignId, label: "Campaign", name: touch.campaign },
        ],
        relationships: [
          { type: `ENGAGED_WITH ×${touch.count}`, from: persona.id, to: touch.assetId },
          { type: "USES", from: touch.campaignId, to: touch.assetId },
        ],
      }));
      return [role, ...touchPaths];
    });
    return {
      account,
      candidates: candidates.map(({ persona, role, score, engagements, touches }) => ({
        persona,
        role,
        score,
        engagements,
        evidence: touches.map((touch) => `${touch.count}× ${touch.asset} (${touch.campaign})`),
      })),
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

export const OVERLAP_CYPHER = `
MATCH (c:Campaign {id: $campaign, dataset: $dataset})-[:TARGETS]->(:Segment)-[:INCLUDES]->(p:Persona)
WITH c, collect(DISTINCT p) AS audience
CALL (c, audience) {
  UNWIND audience AS p
  MATCH (p)<-[:INCLUDES]-(:Segment)<-[:TARGETS]-(other:Campaign)
  WHERE other <> c AND other.status IN ['Active', 'Planned']
  WITH other, p ORDER BY p.name
  RETURN other, count(DISTINCT p) AS shared,
    collect(DISTINCT {id: p.id, name: p.name})[0..2] AS examples
}
RETURN c.id AS campaignId, c.name AS campaign, size(audience) AS audienceSize,
  other.id AS otherId, other.name AS other, other.status AS status, shared, examples
ORDER BY shared DESC, other`;

const findAudienceOverlap = define({
  name: "find_audience_overlap",
  title: "Find audience overlap",
  description: `Find which other active or planned campaigns share audience members with a campaign, with shared counts and example paths, to spot message fatigue. Read-only; never changes segments or suppressions. Campaigns: ${campaignHelp}.`,
  input: z.object({ campaign: z.enum(CAMPAIGN_IDS).describe("Campaign ID") }),
  run: async (backend, { campaign }) => {
    const result = (await rows(backend, OVERLAP_CYPHER, { campaign }, (ix) => {
      const campaignNode = ix.node(campaign);
      const audience = audienceOf(ix, campaign);
      return ALL_CAMPAIGNS.filter(
        (other) =>
          other.id !== campaign && (other.status === "Active" || other.status === "Planned"),
      )
        .map((other) => {
          const theirs = new Set(audienceOf(ix, other.id).map((persona) => persona.id));
          const shared = audience.filter((persona) => theirs.has(persona.id));
          return {
            campaignId: campaign,
            campaign: campaignNode.name,
            audienceSize: audience.length,
            otherId: other.id,
            other: other.name,
            status: other.status,
            shared: shared.length,
            examples: shared.slice(0, 2).map((persona) => ({ id: persona.id, name: persona.name })),
          };
        })
        .filter((row) => row.shared > 0)
        .sort((a, b) => b.shared - a.shared || byText(a.other, b.other));
    })) as Array<{
      campaignId: string;
      campaign: string;
      audienceSize: number;
      otherId: string;
      other: string;
      status: string;
      shared: number;
      examples: PathNode[];
    }>;
    const paths = result.flatMap((row) =>
      row.examples.slice(0, 1).map((persona) => ({
        nodes: [
          { id: row.campaignId, label: "Campaign", name: row.campaign },
          { id: persona.id, label: "Persona", name: persona.name },
          { id: row.otherId, label: "Campaign", name: row.other },
        ],
        relationships: [
          { type: "TARGETS → INCLUDES", from: row.campaignId, to: persona.id },
          { type: "TARGETS → INCLUDES", from: row.otherId, to: persona.id },
        ],
      })),
    );
    return {
      campaign: result[0]?.campaign ?? ALL_CAMPAIGNS.find((item) => item.id === campaign)?.name,
      audienceSize: result[0]?.audienceSize ?? null,
      overlaps: result.map(({ other, status, shared, examples }) => ({
        campaign: other,
        status,
        sharedMembers: shared,
        examples: examples.map((example) => example.name),
      })),
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

export const CONSENT_CYPHER = `
MATCH (req:ConsentScope {id: $scopeId, dataset: $dataset})
MATCH (c:Campaign {id: $campaign, dataset: $dataset})
OPTIONAL MATCH (c)-[:TARGETS]->(:Segment)-[:INCLUDES]->(p:Persona)
WITH req, c, p ORDER BY p.name
WITH req, c, collect(DISTINCT p) AS personas
OPTIONAL MATCH (c)-[:TARGETS]->(s:Segment)-[hc:HAS_CONSENT]->(req)
WITH req, c, personas, s, hc ORDER BY s.name
WITH req, c, personas,
  collect(CASE WHEN s IS NULL THEN NULL ELSE {id: s.id, name: s.name, size: s.size, optedIn: hc.optedIn} END) AS cohorts
RETURN c.id AS campaignId, c.name AS campaign, req.id AS scopeId, req.name AS requiredScope,
  size(personas) AS personaAudience,
  size([p IN personas WHERE EXISTS { (p)-[:HAS_CONSENT]->(req) }]) AS personaCovered,
  [p IN personas WHERE NOT EXISTS { (p)-[:HAS_CONSENT]->(req) } | {id: p.id, name: p.name}][0..5] AS uncovered,
  cohorts,
  EXISTS { (c)-[:ON]->(:Channel {channelId: $channel}) } AS campaignUsesChannel`;

type Cohort = { id: string; name: string; size: number; optedIn: number };

const checkConsentCoverage = define({
  name: "check_consent_coverage",
  title: "Check consent coverage",
  description: `Check how much of a campaign's audience holds the marketing consent a channel requires: individual personas for B2B campaigns, and aggregate app-user segments (push opt-ins) for ${RESTAURANT_BRAND}'s mobile app campaigns, with the members or segments that fall short. Channels: email, sms, mobile-app (push notifications). Read-only; never changes consent or suppressions. Campaigns: ${campaignHelp}.`,
  input: z.object({
    campaign: z.enum(CAMPAIGN_IDS).describe("Campaign ID"),
    channel: z
      .enum([...CHANNELS, "push"])
      .describe("Channel whose marketing consent is required; push means mobile-app"),
  }),
  run: async (backend, { campaign, channel: requested }) => {
    const channel = requested === "push" ? "mobile-app" : requested;
    const scopeId = consentScopeFor(channel);
    const [row] = (await rows(backend, CONSENT_CYPHER, { campaign, channel, scopeId }, (ix) => {
      const audience = audienceOf(ix, campaign);
      const covered = (persona: GraphNode) =>
        ix.outgoing(persona.id, "HAS_CONSENT").some((consent) => consent.to === scopeId);
      const cohorts = ix
        .outgoing(campaign, "TARGETS")
        .flatMap((target) =>
          ix
            .outgoing(target.to, "HAS_CONSENT")
            .filter((consent) => consent.to === scopeId)
            .map((consent) => ({
              id: target.to,
              name: ix.node(target.to).name,
              size: Number(ix.node(target.to).size),
              optedIn: Number(consent.properties?.optedIn),
            })),
        )
        .sort((a, b) => byText(a.name, b.name));
      return [
        {
          campaignId: campaign,
          campaign: ix.node(campaign).name,
          scopeId,
          requiredScope: ix.node(scopeId).name,
          personaAudience: audience.length,
          personaCovered: audience.filter(covered).length,
          uncovered: audience
            .filter((persona) => !covered(persona))
            .slice(0, 5)
            .map((persona) => ({ id: persona.id, name: persona.name })),
          cohorts,
          campaignUsesChannel: ix
            .outgoing(campaign, "ON")
            .some((on) => ix.node(on.to).channelId === channel),
        },
      ];
    })) as Array<{
      campaignId: string;
      campaign: string;
      scopeId: string;
      requiredScope: string;
      personaAudience: number;
      personaCovered: number;
      uncovered: PathNode[];
      cohorts: Cohort[];
      campaignUsesChannel: boolean;
    }>;
    if (!row)
      return { campaign, channel, audience: 0, covered: 0, uncoveredExamples: [], paths: [] };
    const cohorts = row.cohorts.map((cohort) => ({
      ...cohort,
      size: Number(cohort.size),
      optedIn: Number(cohort.optedIn),
    }));
    const audience = row.personaAudience + cohorts.reduce((sum, cohort) => sum + cohort.size, 0);
    const covered = row.personaCovered + cohorts.reduce((sum, cohort) => sum + cohort.optedIn, 0);
    const weakest = [...cohorts].sort(
      (a, b) => a.optedIn / a.size - b.optedIn / b.size || byText(a.name, b.name),
    );
    const campaignNode = { id: row.campaignId, label: "Campaign", name: row.campaign };
    const scopeNode = { id: row.scopeId, label: "ConsentScope", name: row.requiredScope };
    const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
    const paths: EvidencePath[] = [
      ...row.uncovered.slice(0, 3).map((persona) => ({
        nodes: [campaignNode, { id: persona.id, label: "Persona", name: persona.name }, scopeNode],
        relationships: [
          { type: "TARGETS → INCLUDES", from: row.campaignId, to: persona.id },
          { type: "MISSING HAS_CONSENT", from: persona.id, to: row.scopeId },
        ],
      })),
      ...weakest.slice(0, 3).map((cohort) => ({
        nodes: [campaignNode, { id: cohort.id, label: "Segment", name: cohort.name }, scopeNode],
        relationships: [
          { type: "TARGETS", from: row.campaignId, to: cohort.id },
          {
            type: `HAS_CONSENT ${pct(cohort.optedIn / cohort.size)}`,
            from: cohort.id,
            to: row.scopeId,
          },
        ],
      })),
    ];
    return {
      campaign: row.campaign,
      channel,
      requiredScope: row.requiredScope,
      campaignUsesChannel: row.campaignUsesChannel,
      audience,
      covered,
      uncovered: audience - covered,
      coverageRate: audience ? Math.round((covered / audience) * 1000) / 1000 : 0,
      uncoveredExamples: [
        ...row.uncovered.map((persona) => persona.name),
        ...weakest
          .slice(0, 3)
          .map((cohort) => `${cohort.name} (${pct(cohort.optedIn / cohort.size)} opted in)`),
      ],
      segments: cohorts.map((cohort) => ({
        segment: cohort.name,
        appUsers: cohort.size,
        optedIn: cohort.optedIn,
      })),
      paths,
    };
  },
});

/** Past sends by channel. SMS has no send history of its own, so it reads push history. */
const SEND_HISTORY = {
  push: { label: "PushSend", name: "Push send" },
  email: { label: "EmailSend", name: "Email send" },
} as const;

/** Past sends of one kind; the label comes only from SEND_HISTORY, never from input. */
export const sendHistoryCypher = (
  label: (typeof SEND_HISTORY)[keyof typeof SEND_HISTORY]["label"],
) => `
MATCH (s:${label} {dataset: $dataset})-[:FOR]->(:Location {id: $locationId}),
  (s)-[:SENT_DURING]->(:Daypart {id: $daypartId}),
  (s)-[:FEATURED]->(m:MenuItem),
  (s)-[:USED]->(a:ContentAsset)
WHERE $conditionId IS NULL OR EXISTS { (s)-[:UNDER]->(:WeatherCondition {id: $conditionId}) }
WITH m, s, a ORDER BY s.id
WITH m, count(s) AS sends, avg(s.orderRate) AS avgOrderRate, avg(s.openRate) AS avgOpenRate,
  collect(s.angle) AS angles, collect(s.id)[0..1] AS exampleSends,
  collect({id: a.id, name: a.name}) AS assets
RETURN m.id AS itemId, m.name AS item, m.serves AS serves, sends, avgOrderRate, avgOpenRate, angles,
  exampleSends, assets
ORDER BY avgOrderRate DESC, item`;

export const PUSH_AUDIENCE_CYPHER = `
MATCH (seg:Segment {dataset: $dataset})-[:NEAR]->(:Location {id: $locationId})
MATCH (seg)-[hc:HAS_CONSENT]->(scope:ConsentScope {id: $scopeId})
RETURN seg.id AS segmentId, seg.name AS segment, seg.size AS appUsers, hc.optedIn AS optedIn,
  scope.id AS scopeId, scope.name AS scope`;

const round4 = (value: number) => Math.round(value * 10000) / 10000;

const findSimilarPastPushes = define({
  name: "find_similar_past_pushes",
  title: "Find similar past sends",
  description: `Look up ${RESTAURANT_BRAND}'s fictional send history on the campaign's channel (email sends for email, push sends for push; SMS has no history, so it uses push) for the same location, daypart, and weather condition, and return the best-performing menu items, their content, and the message angle by average order rate, plus the location's audience and how many of them hold marketing consent for the campaign's channel. Condition must be clear, cloudy, fog, rain, or heat (use heat when feels-like is 85°F or more; rain for drizzle or storms). If fewer than 5 matching sends exist, it widens to all weather for that location and daypart.`,
  input: z.object({
    location: z.enum(LOCATION_IDS).describe("Restaurant location (same IDs as the weather tool)"),
    daypart: z.enum(DAYPARTS).describe("Local daypart"),
    condition: z.enum(CONDITIONS).describe("Weather bucket"),
    channel: z
      .enum(["push", "email", "sms"])
      .default("push")
      .describe(
        "Channel of the campaign being planned: its send history and its consent are the ones reported",
      ),
  }),
  run: async (backend, { location, daypart, condition, channel = "push" }) => {
    const scopeId = consentScopeFor(channel === "push" ? "mobile-app" : channel);
    const history = channel === "email" ? "email" : "push";
    const sendKind = SEND_HISTORY[history];
    const query = (conditionId: string | null) =>
      rows(
        backend,
        sendHistoryCypher(sendKind.label),
        { locationId: `location-${location}`, daypartId: `daypart-${daypart}`, conditionId },
        (ix) => {
          const groups = new Map<string, { item: GraphNode; sends: GraphNode[] }>();
          for (const send of [...ix.byId.values()].filter(
            (node) => node.label === sendKind.label,
          )) {
            const has = (type: string, id: string) =>
              ix.outgoing(send.id, type).some((r) => r.to === id);
            if (!has("FOR", `location-${location}`) || !has("SENT_DURING", `daypart-${daypart}`))
              continue;
            if (conditionId && !has("UNDER", conditionId)) continue;
            const itemId = ix.outgoing(send.id, "FEATURED")[0]?.to as string;
            if (!ix.outgoing(send.id, "USED")[0]) continue;
            const group = groups.get(itemId) ?? { item: ix.node(itemId), sends: [] };
            group.sends.push(send);
            groups.set(itemId, group);
          }
          return [...groups.values()]
            .map(({ item, sends }) => {
              const sorted = sends.sort((a, b) => byText(a.id, b.id));
              const mean = (key: string) =>
                sorted.reduce((sum, send) => sum + Number(send[key]), 0) / sorted.length;
              return {
                itemId: item.id,
                item: item.name,
                serves: item.serves,
                sends: sorted.length,
                avgOrderRate: mean("orderRate"),
                avgOpenRate: mean("openRate"),
                angles: sorted.map((send) => send.angle),
                exampleSends: sorted.slice(0, 1).map((send) => send.id),
                assets: sorted.map((send) => {
                  const assetId = ix.outgoing(send.id, "USED")[0]?.to as string;
                  return { id: assetId, name: ix.node(assetId).name };
                }),
              };
            })
            .sort((a, b) => b.avgOrderRate - a.avgOrderRate || byText(a.item, b.item));
        },
      ) as Promise<
        Array<{
          itemId: string;
          item: string;
          serves: string;
          sends: number;
          avgOrderRate: number;
          avgOpenRate: number;
          angles: string[];
          exampleSends: string[];
          assets: Array<{ id: string; name: string }>;
        }>
      >;
    let matches = await query(`weather-${condition}`);
    let widened = false;
    if (matches.reduce((sum, row) => sum + row.sends, 0) < 5) {
      matches = await query(null);
      widened = true;
    }
    const top = matches.slice(0, 3);
    const angleCounts = new Map<string, number>();
    for (const angle of top.flatMap((row) => row.angles))
      angleCounts.set(angle, (angleCounts.get(angle) ?? 0) + 1);
    const topAngle = [...angleCounts.entries()].sort(
      (a, b) => b[1] - a[1] || byText(a[0], b[0]),
    )[0]?.[0];
    // The push content each item was sent with most often.
    const mainAsset = (assets: Array<{ id: string; name: string }>) => {
      const counts = new Map<string, { id: string; name: string; count: number }>();
      for (const asset of assets)
        counts.set(asset.id, { ...asset, count: (counts.get(asset.id)?.count ?? 0) + 1 });
      return [...counts.values()].sort((a, b) => b.count - a.count || byText(a.name, b.name))[0];
    };
    const [audience] = (await rows(
      backend,
      PUSH_AUDIENCE_CYPHER,
      { locationId: `location-${location}`, scopeId },
      (ix) =>
        ix.incoming(`location-${location}`, "NEAR").flatMap(({ from: segmentId }) =>
          ix
            .outgoing(segmentId, "HAS_CONSENT")
            .filter((consent) => consent.to === scopeId)
            .map((consent) => ({
              segmentId,
              segment: ix.node(segmentId).name,
              appUsers: ix.node(segmentId).size,
              optedIn: consent.properties?.optedIn,
              scopeId: consent.to,
              scope: ix.node(consent.to).name,
            })),
        ),
    )) as Array<{
      segmentId: string;
      segment: string;
      appUsers: number;
      optedIn: number;
      scopeId: string;
      scope: string;
    }>;
    const paths: EvidencePath[] = top.map((row) => {
      const send = {
        id: row.exampleSends[0] as string,
        label: sendKind.label,
        name: `${row.sends} past sends`,
      };
      const asset = mainAsset(row.assets);
      return {
        nodes: [
          { id: row.itemId, label: "MenuItem", name: row.item },
          send,
          ...(asset ? [{ id: asset.id, label: "ContentAsset", name: asset.name }] : []),
        ],
        relationships: [
          { type: "FEATURED", from: send.id, to: row.itemId },
          ...(asset ? [{ type: "USED", from: send.id, to: asset.id }] : []),
        ],
      };
    });
    const exampleSend = top[0]?.exampleSends[0];
    const consentPath = audience
      ? {
          type: `HAS_CONSENT ${Number(audience.optedIn).toLocaleString("en-US")} opted in`,
          from: audience.segmentId,
          to: audience.scopeId,
        }
      : null;
    // The sends went to this audience; SMS has no sends of its own, so its consent stands alone.
    if (audience && consentPath && channel === "sms")
      paths.push({
        nodes: [
          { id: audience.segmentId, label: "Segment", name: audience.segment },
          { id: audience.scopeId, label: "ConsentScope", name: audience.scope },
        ],
        relationships: [consentPath],
      });
    else if (audience && consentPath && exampleSend)
      paths.push({
        nodes: [
          { id: exampleSend, label: sendKind.label, name: sendKind.name },
          { id: audience.segmentId, label: "Segment", name: audience.segment },
          { id: audience.scopeId, label: "ConsentScope", name: audience.scope },
        ],
        relationships: [
          { type: "SENT_TO", from: exampleSend, to: audience.segmentId },
          consentPath,
        ],
      });
    return {
      location,
      daypart,
      condition,
      widenedToAllWeather: widened,
      totalSends: matches.reduce((sum, row) => sum + row.sends, 0),
      topItems: top.map((row) => ({
        item: row.item,
        serves: row.serves,
        sends: row.sends,
        avgOrderRate: round4(row.avgOrderRate),
        avgOpenRate: round4(row.avgOpenRate),
        content: mainAsset(row.assets)?.name ?? null,
      })),
      bestAngle: topAngle ?? null,
      history,
      audience: audience
        ? {
            segment: audience.segment,
            appUsers: Number(audience.appUsers),
            channel,
            optedIn: Number(audience.optedIn),
            consentScope: audience.scope,
          }
        : null,
      note:
        channel === "sms"
          ? "Fictional history for demonstration. There is no SMS send history, so menu performance and content come from past pushes; the audience count is SMS marketing consent."
          : `Fictional ${history} history for demonstration.`,
      paths,
    };
  },
});

export const LINEAGE_CYPHER = `
MATCH (b:Brief {dataset: $dataset})-[:FOR]->(c:Campaign {id: $campaign})
MATCH (a:ContentAsset)-[:BUILT_FROM]->(b)
OPTIONAL MATCH (a)-[r:PASSED|FAILED]->(rule:BrandRule)
WITH c, b, a, r, rule ORDER BY rule.name
WITH c, b, a, collect(CASE WHEN rule IS NULL THEN NULL ELSE {ruleId: rule.id, rule: rule.name, result: type(r)} END) AS checks
RETURN c.id AS campaignId, c.name AS campaign, b.id AS briefId, b.name AS brief,
  a.id AS assetId, a.name AS asset, a.kind AS kind, checks
ORDER BY asset`;

const traceContentLineage = define({
  name: "trace_content_lineage",
  title: "Trace content lineage",
  description: `Trace a campaign's brief to the content built from it and each asset's brand-rule results (passed or failed). Read-only. Campaigns: ${campaignHelp}.`,
  input: z.object({ campaign: z.enum(CAMPAIGN_IDS).describe("Campaign ID") }),
  run: async (backend, { campaign }) => {
    const result = (await rows(backend, LINEAGE_CYPHER, { campaign }, (ix) =>
      ix
        .incoming(campaign, "FOR")
        .filter((relationship) => ix.node(relationship.from).label === "Brief")
        .flatMap(({ from: briefId }) =>
          ix.incoming(briefId, "BUILT_FROM").map(({ from: assetId }) => ({
            campaignId: campaign,
            campaign: ix.node(campaign).name,
            briefId,
            brief: ix.node(briefId).name,
            assetId,
            asset: ix.node(assetId).name,
            kind: ix.node(assetId).kind,
            checks: [...ix.outgoing(assetId, "PASSED"), ...ix.outgoing(assetId, "FAILED")]
              .map((check) => ({
                ruleId: check.to,
                rule: ix.node(check.to).name,
                result: check.type,
              }))
              .sort((a, b) => byText(a.rule, b.rule)),
          })),
        )
        .sort((a, b) => byText(a.asset, b.asset)),
    )) as Array<{
      campaignId: string;
      campaign: string;
      briefId: string;
      brief: string;
      assetId: string;
      asset: string;
      kind: string;
      checks: Array<{ ruleId: string; rule: string; result: "PASSED" | "FAILED" }>;
    }>;
    const paths = result.flatMap((row) => {
      const failed = row.checks.find((check) => check.result === "FAILED");
      return [
        {
          nodes: [
            { id: row.briefId, label: "Brief", name: row.brief },
            { id: row.assetId, label: "ContentAsset", name: row.asset },
            ...(failed ? [{ id: failed.ruleId, label: "BrandRule", name: failed.rule }] : []),
          ],
          relationships: [
            { type: "BUILT_FROM", from: row.assetId, to: row.briefId },
            ...(failed ? [{ type: "FAILED", from: row.assetId, to: failed.ruleId }] : []),
          ],
        },
      ];
    });
    return {
      campaign: result[0]?.campaign ?? campaign,
      brief: result[0]?.brief ?? null,
      assets: result.map((row) => ({
        asset: row.asset,
        kind: row.kind,
        passed: row.checks.filter((check) => check.result === "PASSED").map((check) => check.rule),
        failed: row.checks.filter((check) => check.result === "FAILED").map((check) => check.rule),
      })),
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Use-case tools: account outreach planning (sales) and location impact (service).

export const OUTREACH_CYPHER = `
MATCH (a:Account {name: $account, dataset: $dataset})<-[:WORKS_AT]-(p:Persona)
CALL (p) {
  OPTIONAL MATCH (p)-[e:ENGAGED_WITH]->(:ContentAsset)
  RETURN sum(coalesce(e.count, 0)) AS engagements, min(e.lastDaysAgo) AS lastDaysAgo
}
CALL (p) {
  OPTIONAL MATCH (p)-[:HAS_CONSENT]->(s:ConsentScope {purpose: "marketing"})-[:FOR]->(ch:Channel)
  WITH s, ch ORDER BY ch.channelId
  RETURN collect(CASE WHEN ch IS NULL THEN NULL ELSE {scopeId: s.id, scope: s.name, channelId: ch.id, channel: ch.name} END) AS channels
}
RETURN a.id AS accountId, a.name AS account, a.country AS country, a.countryName AS countryName,
  p.id AS personaId, p.name AS persona, p.role AS role, p.roleWeight + engagements AS score,
  engagements, lastDaysAgo, channels
ORDER BY score DESC, persona
LIMIT $limit`;

type OutreachRow = {
  accountId: string;
  account: string;
  country: string;
  countryName: string;
  personaId: string;
  persona: string;
  role: string;
  score: number;
  engagements: number;
  lastDaysAgo: number | null;
  channels: Array<{ scopeId: string; scope: string; channelId: string; channel: string }>;
};

const planAccountOutreach = define({
  name: "plan_account_outreach",
  title: "Plan account outreach",
  description:
    "For an account's buying-role personas: who to contact first (role and engagement), when they last engaged, and which channels each has marketing consent for, plus the account's headquarters country for scheduling around local holidays. Every contact comes with its evidence path. Read-only.",
  input: z.object({
    account: z.enum(ACCOUNTS).describe("Fictional account name"),
    limit: z.number().int().min(1).max(10).default(5).describe("Contacts to return"),
  }),
  run: async (backend, { account, limit }) => {
    const result = (await rows(backend, OUTREACH_CYPHER, { account, limit }, (ix) => {
      const accountNode = [...ix.byId.values()].find(
        (node) => node.label === "Account" && node.name === account,
      );
      if (!accountNode) return [];
      return ix
        .incoming(accountNode.id, "WORKS_AT")
        .map(({ from }) => ix.node(from))
        .map((persona) => {
          const engagements = ix.outgoing(persona.id, "ENGAGED_WITH");
          const channels = ix
            .outgoing(persona.id, "HAS_CONSENT")
            .map(({ to }) => ix.node(to))
            .filter((scope) => scope.purpose === "marketing")
            .flatMap((scope) =>
              ix.outgoing(scope.id, "FOR").map(({ to }) => ({ scope, channel: ix.node(to) })),
            )
            .sort((a, b) => byText(String(a.channel.channelId), String(b.channel.channelId)))
            .map(({ scope, channel }) => ({
              scopeId: scope.id,
              scope: scope.name,
              channelId: channel.id,
              channel: channel.name,
            }));
          const days = engagements.map((edge) => Number(edge.properties?.lastDaysAgo));
          const total = engagements.reduce(
            (sum, edge) => sum + Number(edge.properties?.count ?? 0),
            0,
          );
          return {
            accountId: accountNode.id,
            account: accountNode.name,
            country: accountNode.country,
            countryName: accountNode.countryName,
            personaId: persona.id,
            persona: persona.name,
            role: persona.role,
            score: Number(persona.roleWeight) + total,
            engagements: total,
            lastDaysAgo: days.length ? Math.min(...days) : null,
            channels,
          };
        })
        .sort((a, b) => b.score - a.score || byText(a.persona, b.persona))
        .slice(0, limit);
    })) as OutreachRow[];
    const first = result[0];
    const paths: EvidencePath[] = result.flatMap((row) => {
      const persona = { id: row.personaId, label: "Persona", name: row.persona };
      const accountNode = { id: row.accountId, label: "Account", name: row.account };
      return [
        {
          nodes: [persona, accountNode],
          relationships: [{ type: "WORKS_AT", from: persona.id, to: accountNode.id }],
        },
        ...row.channels.slice(0, 2).map((channel) => ({
          nodes: [
            persona,
            { id: channel.scopeId, label: "ConsentScope", name: channel.scope },
            { id: channel.channelId, label: "Channel", name: channel.channel },
          ],
          relationships: [
            { type: "HAS_CONSENT", from: persona.id, to: channel.scopeId },
            { type: "FOR", from: channel.scopeId, to: channel.channelId },
          ],
        })),
      ];
    });
    return {
      account,
      country: first?.country ?? null,
      countryName: first?.countryName ?? null,
      contacts: result.map((row) => ({
        persona: row.persona,
        role: row.role,
        score: row.score,
        engagements: row.engagements,
        lastEngagedDaysAgo: row.lastDaysAgo,
        reachableBy: row.channels.map((channel) => channel.channel),
      })),
      notReachable: result.filter((row) => row.channels.length === 0).map((row) => row.persona),
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

export const LOCATION_IMPACT_CYPHER = `
MATCH (l:Location {dataset: $dataset, weatherLocation: $location})<-[:NEAR]-(s:Segment)
OPTIONAL MATCH (s)-[c:HAS_CONSENT]->(scope:ConsentScope)
WITH l, s, scope, c ORDER BY scope.id
WITH l, s, collect(CASE WHEN scope IS NULL THEN NULL ELSE {scopeId: scope.id, scope: scope.name, channel: scope.channel, optedIn: c.optedIn, coverageRate: c.coverageRate} END) AS consents
CALL (s) {
  OPTIONAL MATCH (camp:Campaign)-[:TARGETS]->(s)
  WITH camp ORDER BY camp.name
  RETURN collect(CASE WHEN camp IS NULL THEN NULL ELSE {id: camp.id, name: camp.name, status: camp.status} END) AS campaigns
}
CALL (s) {
  OPTIONAL MATCH (p:PushSend)-[:SENT_TO]->(s)
  RETURN count(p) AS pastSends
}
RETURN l.id AS locationId, l.name AS location, l.city AS city, l.address AS address,
  s.id AS segmentId, s.name AS segment, s.size AS size, consents, campaigns, pastSends`;

type ImpactRow = {
  locationId: string;
  location: string;
  city: string;
  address: string;
  segmentId: string;
  segment: string;
  size: number;
  consents: Array<{
    scopeId: string;
    scope: string;
    channel: string;
    optedIn: number;
    coverageRate: number;
  }>;
  campaigns: Array<{ id: string; name: string; status: string }>;
  pastSends: number;
};

const assessLocationImpact = define({
  name: "assess_location_impact",
  title: "Assess location impact",
  description: `For a ${RESTAURANT_BRAND} location: the app audience near it (aggregate counts, no individuals), how many can be reached on each channel (push, email, SMS) under that channel's marketing consent, and the campaigns that target that audience and may need pausing during a disruption, each with its evidence path. Read-only.`,
  input: z.object({
    location: z.enum(LOCATION_IDS).describe(`${RESTAURANT_BRAND} location (city id)`),
  }),
  run: async (backend, { location }) => {
    const [row] = (await rows(backend, LOCATION_IMPACT_CYPHER, { location }, (ix) => {
      const locationNode = [...ix.byId.values()].find(
        (node) => node.label === "Location" && node.weatherLocation === location,
      );
      if (!locationNode) return [];
      return ix.incoming(locationNode.id, "NEAR").map(({ from }) => {
        const segment = ix.node(from);
        return {
          locationId: locationNode.id,
          location: locationNode.name,
          city: locationNode.city,
          address: locationNode.address,
          segmentId: segment.id,
          segment: segment.name,
          size: segment.size,
          consents: ix
            .outgoing(segment.id, "HAS_CONSENT")
            .sort((a, b) => byText(a.to, b.to))
            .map((edge) => {
              const scope = ix.node(edge.to);
              return {
                scopeId: scope.id,
                scope: scope.name,
                channel: scope.channel,
                optedIn: edge.properties?.optedIn,
                coverageRate: edge.properties?.coverageRate,
              };
            }),
          campaigns: ix
            .incoming(segment.id, "TARGETS")
            .map(({ from }) => ix.node(from))
            .sort((a, b) => byText(a.name, b.name))
            .map((campaign) => ({ id: campaign.id, name: campaign.name, status: campaign.status })),
          pastSends: ix
            .incoming(segment.id, "SENT_TO")
            .filter(({ from }) => ix.node(from).label === "PushSend").length,
        };
      });
    })) as ImpactRow[];
    if (!row) return { location, found: false, paths: [] };
    const segment = { id: row.segmentId, label: "Segment", name: row.segment };
    const locationNode = { id: row.locationId, label: "Location", name: row.location };
    const paths: EvidencePath[] = [
      {
        nodes: [segment, locationNode],
        relationships: [{ type: "NEAR", from: segment.id, to: locationNode.id }],
      },
      ...row.consents.map((consent) => ({
        nodes: [segment, { id: consent.scopeId, label: "ConsentScope", name: consent.scope }],
        relationships: [
          {
            type: `HAS_CONSENT ${Number(consent.optedIn).toLocaleString("en-US")} opted in`,
            from: segment.id,
            to: consent.scopeId,
          },
        ],
      })),
      ...row.campaigns.map((campaign) => ({
        nodes: [{ id: campaign.id, label: "Campaign", name: campaign.name }, segment],
        relationships: [{ type: "TARGETS", from: campaign.id, to: segment.id }],
      })),
    ];
    return {
      location: row.location,
      city: row.city,
      address: row.address,
      found: true,
      affectedAppUsers: row.size,
      reachableByChannel: row.consents.map((consent) => ({
        channel: consent.channel === "mobile-app" ? "push" : consent.channel,
        consentScope: consent.scope,
        optedIn: Number(consent.optedIn),
        coverageRate: Number(consent.coverageRate),
      })),
      campaignsToReview: row.campaigns.filter((campaign) => campaign.status === "Active"),
      pastPushSends: row.pastSends,
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

export const WEATHER_DEMAND_CYPHER = `
MATCH (l:Location {dataset: $dataset, weatherLocation: $location})
OPTIONAL MATCH (l)-[:MANAGED_BY]->(m:StoreManager)
CALL () {
  MATCH (w:WeatherCondition {dataset: $dataset})-[d:LIFTS_DEMAND]->(item:MenuItem)-[u:MADE_WITH]->(inv:InventoryItem)
  WHERE w.name IN $conditions
  RETURN collect({conditionId: w.id, condition: w.name, lift: d.lift, sends: d.sends,
    itemId: item.id, item: item.name, inventoryId: inv.id, inventory: inv.name, unit: inv.unit,
    perServing: u.perServing}) AS links
}
RETURN l.id AS locationId, l.name AS location, l.city AS city,
  m.id AS managerId, m.name AS manager, links`;

type DemandLink = {
  conditionId: string;
  condition: string;
  lift: number;
  sends: number;
  itemId: string;
  item: string;
  inventoryId: string;
  inventory: string;
  unit: string;
  perServing: number;
};
type DemandRow = {
  locationId: string;
  location: string;
  city: string;
  managerId: string | null;
  manager: string | null;
  links: DemandLink[];
};

const mapWeatherDemand = define({
  name: "map_weather_demand",
  title: "Map weather to menu demand and inventory",
  description: `For a ${RESTAURANT_BRAND} location and the weather conditions in its forecast: the menu items whose demand those conditions lift (learned from past push results), the inventory items each one is made with and how much a serving uses, and the location's store manager, each with its evidence path. Read-only; it does not read stock levels.`,
  input: z.object({
    location: z.enum(LOCATION_IDS).describe(`${RESTAURANT_BRAND} location (city id)`),
    conditions: z
      .array(z.enum(CONDITIONS))
      .min(1)
      .max(3)
      .describe("Forecast weather conditions: clear, cloudy, fog, rain, or heat"),
  }),
  run: async (backend, { location, conditions }) => {
    const [row] = (await rows(backend, WEATHER_DEMAND_CYPHER, { location, conditions }, (ix) => {
      const locationNode = [...ix.byId.values()].find(
        (node) => node.label === "Location" && node.weatherLocation === location,
      );
      if (!locationNode) return [];
      const managerEdge = ix.outgoing(locationNode.id, "MANAGED_BY")[0];
      const manager = managerEdge ? ix.node(managerEdge.to) : null;
      const links: DemandLink[] = [];
      for (const condition of conditions) {
        const weather = ix.node(`weather-${condition}`);
        for (const lifts of ix.outgoing(weather.id, "LIFTS_DEMAND")) {
          const item = ix.node(lifts.to);
          for (const made of ix.outgoing(item.id, "MADE_WITH")) {
            const inventory = ix.node(made.to);
            links.push({
              conditionId: weather.id,
              condition: weather.name,
              lift: Number(lifts.properties?.lift),
              sends: Number(lifts.properties?.sends),
              itemId: item.id,
              item: item.name,
              inventoryId: inventory.id,
              inventory: inventory.name,
              unit: String(inventory.unit),
              perServing: Number(made.properties?.perServing),
            });
          }
        }
      }
      return [
        {
          locationId: locationNode.id,
          location: locationNode.name,
          city: locationNode.city,
          managerId: manager?.id ?? null,
          manager: manager?.name ?? null,
          links,
        },
      ];
    })) as DemandRow[];
    if (!row) return { location, found: false, conditions, paths: [] };
    const links = [...row.links].sort(
      (a, b) =>
        b.lift - a.lift ||
        byText(a.item, b.item) ||
        byText(a.condition, b.condition) ||
        byText(a.inventory, b.inventory),
    );
    const menuItems = new Map<
      string,
      { name: string; lift: number; conditions: Array<{ condition: string; lift: number }> }
    >();
    const inventory = new Map<
      string,
      {
        id: string;
        name: string;
        unit: string;
        maxLift: number;
        usedBy: Array<{ menuItem: string; perServing: number }>;
      }
    >();
    for (const link of links) {
      const item = menuItems.get(link.itemId) ?? { name: link.item, lift: 0, conditions: [] };
      if (!item.conditions.some((entry) => entry.condition === link.condition))
        item.conditions.push({ condition: link.condition, lift: link.lift });
      item.lift = Math.max(item.lift, link.lift);
      menuItems.set(link.itemId, item);
      const stock = inventory.get(link.inventoryId) ?? {
        id: link.inventoryId.replace(/^inventory-/, ""),
        name: link.inventory,
        unit: link.unit,
        maxLift: 0,
        usedBy: [],
      };
      if (!stock.usedBy.some((use) => use.menuItem === link.item))
        stock.usedBy.push({ menuItem: link.item, perServing: link.perServing });
      stock.maxLift = Math.max(stock.maxLift, link.lift);
      inventory.set(link.inventoryId, stock);
    }
    const locationNode = { id: row.locationId, label: "Location", name: row.location };
    const seen = new Set<string>();
    const paths: EvidencePath[] = [];
    if (row.managerId && row.manager)
      paths.push({
        nodes: [locationNode, { id: row.managerId, label: "StoreManager", name: row.manager }],
        relationships: [{ type: "MANAGED_BY", from: locationNode.id, to: row.managerId }],
      });
    for (const link of links) {
      const key = `${link.conditionId}|${link.itemId}|${link.inventoryId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push({
        nodes: [
          { id: link.conditionId, label: "WeatherCondition", name: link.condition },
          { id: link.itemId, label: "MenuItem", name: link.item },
          { id: link.inventoryId, label: "InventoryItem", name: link.inventory },
        ],
        relationships: [
          { type: "LIFTS_DEMAND", from: link.conditionId, to: link.itemId },
          { type: "MADE_WITH", from: link.itemId, to: link.inventoryId },
        ],
      });
    }
    return {
      location: row.location,
      locationId: location,
      city: row.city,
      found: true,
      conditions,
      manager: row.manager ? { name: row.manager } : null,
      menuItems: [...menuItems.values()].sort((a, b) => b.lift - a.lift || byText(a.name, b.name)),
      inventoryItems: [...inventory.values()].sort(
        (a, b) => b.maxLift - a.maxLift || byText(a.name, b.name),
      ),
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Financial services use cases (Sample Wealth): approved content for market news, an
// embargoed acquisition release, and account plans to grow assets under management.

type Consent = { scopeId: string; channel: string; purpose: string; optedIn: number };
type Disclosure = { id: string; name: string; text: string };
type AssetFacts = {
  assetId: string;
  asset: string;
  kind: string;
  channel: string | null;
  approvalNodeId: string;
  approvalId: string;
  status: string;
  approvedOn: string | null;
  expiresOn: string | null;
  embargoed: boolean | null;
  disclosures: Disclosure[];
  failedRules: string[];
};

const ASSET_FACTS_CYPHER = `
MATCH (a)-[:APPROVED_UNDER]->(ap:Approval)
CALL (a) {
  OPTIONAL MATCH (a)-[:REQUIRES]->(d:Disclosure)
  WITH d ORDER BY d.id
  RETURN collect(CASE WHEN d IS NULL THEN NULL ELSE {id: d.id, name: d.name, text: d.text} END) AS disclosures
}
CALL (a) {
  OPTIONAL MATCH (a)-[:FAILED]->(r:BrandRule)
  WITH r ORDER BY r.name
  RETURN collect(r.name) AS failedRules
}`;
const ASSET_FACTS_RETURN = `a.id AS assetId, a.name AS asset, a.kind AS kind, a.channel AS channel,
  ap.id AS approvalNodeId, ap.name AS approvalId, ap.status AS status, ap.approvedOn AS approvedOn,
  ap.expiresOn AS expiresOn, ap.embargoed AS embargoed, disclosures, failedRules`;

function assetFacts(ix: Index, assetId: string): AssetFacts {
  const asset = ix.node(assetId);
  const approval = ix.node((ix.outgoing(assetId, "APPROVED_UNDER")[0] as { to: string }).to);
  return {
    assetId: asset.id,
    asset: asset.name,
    kind: String(asset.kind),
    channel: (asset.channel as string | undefined) ?? null,
    approvalNodeId: approval.id,
    approvalId: approval.name,
    status: String(approval.status),
    approvedOn: (approval.approvedOn as string | undefined) ?? null,
    expiresOn: (approval.expiresOn as string | undefined) ?? null,
    embargoed: (approval.embargoed as boolean | undefined) ?? null,
    disclosures: ix
      .outgoing(assetId, "REQUIRES")
      .map(({ to }) => ix.node(to))
      .sort((a, b) => byText(a.id, b.id))
      .map((node) => ({ id: node.id, name: node.name, text: String(node.text) })),
    failedRules: ix
      .outgoing(assetId, "FAILED")
      .map(({ to }) => ix.node(to).name)
      .sort(byText),
  };
}

function consentsOf(ix: Index, segmentId: string): Consent[] {
  return ix
    .outgoing(segmentId, "HAS_CONSENT")
    .map((edge) => ({ edge, scope: ix.node(edge.to) }))
    .sort((a, b) => byText(a.scope.id, b.scope.id))
    .map(({ edge, scope }) => ({
      scopeId: scope.id,
      channel: String(scope.channel),
      purpose: String(scope.purpose),
      optedIn: Number(edge.properties?.optedIn),
    }));
}

/** Why an asset can't go out now, or an empty list when it's approved and releasable. */
function releaseBlockers(facts: AssetFacts, { allowEmbargoed = false } = {}) {
  const blockers: string[] = [];
  if (facts.status === "Expired")
    blockers.push(`Approval ${facts.approvalId} expired on ${facts.expiresOn}; needs re-approval`);
  else if (facts.status === "Pending")
    blockers.push(`Approval ${facts.approvalId} is still pending with compliance`);
  if (facts.embargoed && !allowEmbargoed)
    blockers.push(`Embargoed until the announcement (${facts.approvalId})`);
  for (const rule of facts.failedRules) blockers.push(`Failed compliance check: ${rule}`);
  return blockers;
}

const approvalSummary = (facts: AssetFacts) => ({
  id: facts.approvalId,
  status: facts.status,
  approvedOn: facts.approvedOn,
  expiresOn: facts.expiresOn,
  ...(facts.embargoed ? { embargoed: true } : {}),
});

function assetPaths(facts: AssetFacts, anchor?: { node: PathNode; type: string }) {
  const asset = { id: facts.assetId, label: "ContentAsset", name: facts.asset };
  const approval = { id: facts.approvalNodeId, label: "Approval", name: facts.approvalId };
  const lead = anchor
    ? {
        nodes: [asset, anchor.node, approval],
        relationships: [
          { type: anchor.type, from: asset.id, to: anchor.node.id },
          { type: "APPROVED_UNDER", from: asset.id, to: approval.id },
        ],
      }
    : {
        nodes: [asset, approval],
        relationships: [{ type: "APPROVED_UNDER", from: asset.id, to: approval.id }],
      };
  const disclosure = facts.disclosures[0];
  return [
    lead,
    ...(disclosure
      ? [
          {
            nodes: [asset, { id: disclosure.id, label: "Disclosure", name: disclosure.name }],
            relationships: [{ type: "REQUIRES", from: asset.id, to: disclosure.id }],
          },
        ]
      : []),
  ];
}

export const NEWS_CONTENT_CYPHER = `
MATCH (e:MarketEvent {dataset: $dataset, id: $eventId})<-[:RESPONDS_TO]-(a:ContentAsset)
${ASSET_FACTS_CYPHER}
OPTIONAL MATCH (camp:Campaign)-[:USES]->(a)
RETURN e.id AS eventId, e.name AS event, camp.id AS campaignId, camp.name AS campaign,
  ${ASSET_FACTS_RETURN}
ORDER BY a.id`;

export const NEWS_AUDIENCE_CYPHER = `
MATCH (:MarketEvent {dataset: $dataset, id: $eventId})<-[:RESPONDS_TO]-(:ContentAsset)<-[:USES]-(:Campaign)-[:TARGETS]->(s:Segment)
WITH DISTINCT s
OPTIONAL MATCH (s)-[c:HAS_CONSENT]->(scope:ConsentScope)
WITH s, scope, c ORDER BY scope.id
RETURN s.id AS segmentId, s.name AS segment, s.size AS size,
  collect(CASE WHEN scope IS NULL THEN NULL ELSE {scopeId: scope.id, channel: scope.channel, purpose: scope.purpose, optedIn: c.optedIn} END) AS consents
ORDER BY segmentId`;

export const NEWS_RESPONSES_CYPHER = `
MATCH (:MarketEvent {dataset: $dataset, id: $eventId})<-[:RESPONDS_TO]-(r:ClientSend)-[:USED]->(a:ContentAsset)
RETURN r.id AS sendId, r.name AS send, r.hoursAfterNews AS hoursAfterNews, r.openRate AS openRate,
  r.clickRate AS clickRate, a.id AS assetId, a.name AS asset
ORDER BY hoursAfterNews, sendId`;

type NewsAssetRow = AssetFacts & {
  eventId: string;
  event: string;
  campaignId: string | null;
  campaign: string | null;
};
type AudienceRow = { segmentId: string; segment: string; size: number; consents: Consent[] };
type ResponseRow = {
  sendId: string;
  send: string;
  hoursAfterNews: number;
  openRate: number;
  clickRate: number;
  assetId: string;
  asset: string;
};

const matchNewsToApprovedContent = define({
  name: "match_news_to_approved_content",
  title: "Match market news to approved content",
  description: `For a market event (from the Federal Reserve news tool's event field: rate-increase, rate-cut, rate-hold, or market-volatility), find ${WEALTH_BRAND}'s pre-approved regulated content for it: which assets are approved and releasable now (with approval ID, expiry, required disclosures, and channel), which are blocked and why (expired or pending approval, failed compliance check), how many clients and subscribers can be reached on each channel under marketing consent, and how fast past responses went out and how they performed. Each with its evidence path. Read-only.`,
  input: z.object({
    event: z.enum(MARKET_EVENT_IDS).describe("Market event, from the news tool's event field"),
    channel: z
      .enum(["email", "sms", "any"])
      .default("any")
      .describe("Limit to one channel, or any"),
  }),
  run: async (backend, { event, channel }) => {
    const eventId = marketEventId(event);
    const eventNode = { id: eventId, label: "MarketEvent", name: MARKET_EVENTS[event] };
    const assetRows = (await rows(backend, NEWS_CONTENT_CYPHER, { eventId }, (ix) =>
      ix
        .incoming(eventId, "RESPONDS_TO")
        .map(({ from }) => ix.node(from))
        .filter((node) => node.label === "ContentAsset")
        .sort((a, b) => byText(a.id, b.id))
        .map((asset) => {
          const campaign = ix.incoming(asset.id, "USES")[0];
          const campaignNode = campaign ? ix.node(campaign.from) : null;
          return {
            eventId,
            event: MARKET_EVENTS[event],
            campaignId: campaignNode?.id ?? null,
            campaign: campaignNode?.name ?? null,
            ...assetFacts(ix, asset.id),
          };
        }),
    )) as NewsAssetRow[];
    const audienceRows = (await rows(backend, NEWS_AUDIENCE_CYPHER, { eventId }, (ix) => {
      const segments = new Set<string>();
      for (const { from } of ix.incoming(eventId, "RESPONDS_TO"))
        for (const uses of ix.incoming(from, "USES"))
          for (const target of ix.outgoing(uses.from, "TARGETS")) segments.add(target.to);
      return [...segments].sort(byText).map((segmentId) => {
        const segment = ix.node(segmentId);
        return {
          segmentId,
          segment: segment.name,
          size: Number(segment.size),
          consents: consentsOf(ix, segmentId),
        };
      });
    })) as AudienceRow[];
    const responseRows = (await rows(backend, NEWS_RESPONSES_CYPHER, { eventId }, (ix) =>
      ix
        .incoming(eventId, "RESPONDS_TO")
        .map(({ from }) => ix.node(from))
        .filter((node) => node.label === "ClientSend")
        .map((send) => {
          const asset = ix.node((ix.outgoing(send.id, "USED")[0] as { to: string }).to);
          return {
            sendId: send.id,
            send: send.name,
            hoursAfterNews: Number(send.hoursAfterNews),
            openRate: Number(send.openRate),
            clickRate: Number(send.clickRate),
            assetId: asset.id,
            asset: asset.name,
          };
        })
        .sort((a, b) => a.hoursAfterNews - b.hoursAfterNews || byText(a.sendId, b.sendId)),
    )) as ResponseRow[];

    const inChannel = assetRows.filter((row) => channel === "any" || row.channel === channel);
    const reachable = (assetChannel: string | null) =>
      audienceRows.reduce(
        (sum, audience) =>
          sum +
          (audience.consents.find(
            (consent) => consent.channel === assetChannel && consent.purpose === "marketing",
          )?.optedIn ?? 0),
        0,
      );
    const ready = inChannel.filter((row) => releaseBlockers(row).length === 0);
    const blocked = inChannel.filter((row) => releaseBlockers(row).length > 0);
    const paths: EvidencePath[] = [
      ...ready.flatMap((row) => assetPaths(row, { node: eventNode, type: "RESPONDS_TO" })),
      ...blocked.map((row) => {
        const asset = { id: row.assetId, label: "ContentAsset", name: row.asset };
        const approval = { id: row.approvalNodeId, label: "Approval", name: row.approvalId };
        return {
          nodes: [asset, approval],
          relationships: [
            { type: `APPROVED_UNDER (${row.status})`, from: asset.id, to: approval.id },
          ],
        };
      }),
      ...audienceRows.flatMap((audience) =>
        audience.consents
          .filter((consent) => consent.purpose === "marketing")
          .map((consent) => ({
            nodes: [
              { id: audience.segmentId, label: "Segment", name: audience.segment },
              { id: consent.scopeId, label: "ConsentScope", name: `${consent.channel} marketing` },
            ],
            relationships: [
              {
                type: `HAS_CONSENT ${consent.optedIn.toLocaleString("en-US")} opted in`,
                from: audience.segmentId,
                to: consent.scopeId,
              },
            ],
          })),
      ),
    ];
    const fastest = responseRows.filter((row) => row.hoursAfterNews <= 6);
    const slowest = responseRows.filter((row) => row.hoursAfterNews > 6);
    const average = (values: number[]) =>
      values.length ? round4(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    return {
      event,
      eventName: MARKET_EVENTS[event],
      channel,
      readyToSend: ready.map((row) => ({
        asset: row.asset,
        channel: row.channel,
        campaign: row.campaign,
        approval: approvalSummary(row),
        disclosures: row.disclosures.map((disclosure) => disclosure.text),
        reachableUnderMarketingConsent: reachable(row.channel),
      })),
      blocked: blocked.map((row) => ({
        asset: row.asset,
        channel: row.channel,
        approval: approvalSummary(row),
        reasons: releaseBlockers(row),
      })),
      audiences: audienceRows.map((audience) => ({
        segment: audience.segment,
        size: audience.size,
        marketingOptIns: Object.fromEntries(
          audience.consents
            .filter((consent) => consent.purpose === "marketing")
            .map((consent) => [consent.channel, consent.optedIn]),
        ),
      })),
      pastResponses: responseRows.map((row) => ({
        asset: row.asset,
        hoursAfterNews: row.hoursAfterNews,
        openRate: row.openRate,
        clickRate: row.clickRate,
      })),
      speed: {
        withinSixHours: {
          sends: fastest.length,
          avgOpenRate: average(fastest.map((row) => row.openRate)),
        },
        later: { sends: slowest.length, avgOpenRate: average(slowest.map((row) => row.openRate)) },
      },
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

export const DEAL_RELEASE_CYPHER = `
MATCH (d:Deal {dataset: $dataset, id: $dealId})
OPTIONAL MATCH (d)-[:ACQUIRES]->(f:Firm)
MATCH (a:ContentAsset)-[rw:RELEASED_WITH]->(d)
${ASSET_FACTS_CYPHER}
CALL (a) {
  OPTIONAL MATCH (a)-[:ADDRESSED_TO]->(s:Segment)
  OPTIONAL MATCH (s)-[c:HAS_CONSENT]->(scope:ConsentScope)
  WITH s, scope, c ORDER BY scope.id
  RETURN s.id AS segmentId, s.name AS segment, s.size AS size,
    collect(CASE WHEN scope IS NULL THEN NULL ELSE {scopeId: scope.id, channel: scope.channel, purpose: scope.purpose, optedIn: c.optedIn} END) AS consents
}
RETURN d.id AS dealId, d.name AS deal, d.status AS dealStatus, f.id AS firmId, f.name AS firm,
  rw.step AS step, rw.timing AS timing, rw.purpose AS purpose, segmentId, segment, size, consents,
  ${ASSET_FACTS_RETURN}
ORDER BY step, assetId`;

type DealRow = AssetFacts & {
  dealId: string;
  deal: string;
  dealStatus: string;
  firmId: string | null;
  firm: string | null;
  step: number;
  timing: string;
  purpose: string;
  segmentId: string | null;
  segment: string | null;
  size: number | null;
  consents: Consent[];
};

const prepareDealRelease = define({
  name: "prepare_deal_release",
  title: "Prepare an acquisition announcement release",
  description: `For ${WEALTH_BRAND}'s embargoed acquisition (deal-bayview: Bayview Retirement Advisors), the pre-approved announcement package in release order: each asset's timing, audience, the consent it relies on (a service notice, marketing, internal, or public) and how many can be reached under it, its approval (embargoed until the announcement) and required disclosures, and anything that blocks it. Each with its evidence path. Read-only: it releases nothing.`,
  input: z.object({
    deal: z.enum(DEAL_IDS).default(DEAL.id).describe("The acquisition"),
  }),
  run: async (backend, { deal }) => {
    const result = (await rows(backend, DEAL_RELEASE_CYPHER, { dealId: deal }, (ix) => {
      const dealNode = ix.byId.get(deal);
      if (!dealNode) return [];
      const firmEdge = ix.outgoing(deal, "ACQUIRES")[0];
      const firm = firmEdge ? ix.node(firmEdge.to) : null;
      return ix
        .incoming(deal, "RELEASED_WITH")
        .map((edge) => {
          const audienceEdge = ix.outgoing(edge.from, "ADDRESSED_TO")[0];
          const segment = audienceEdge ? ix.node(audienceEdge.to) : null;
          return {
            dealId: dealNode.id,
            deal: dealNode.name,
            dealStatus: String(dealNode.status),
            firmId: firm?.id ?? null,
            firm: firm?.name ?? null,
            step: Number(edge.properties?.step),
            timing: String(edge.properties?.timing),
            purpose: String(edge.properties?.purpose),
            segmentId: segment?.id ?? null,
            segment: segment?.name ?? null,
            size: segment ? Number(segment.size) : null,
            consents: segment ? consentsOf(ix, segment.id) : [],
            ...assetFacts(ix, edge.from),
          };
        })
        .sort((a, b) => a.step - b.step || byText(a.assetId, b.assetId));
    })) as DealRow[];
    const first = result[0];
    if (!first) return { deal, found: false, paths: [] };
    const dealNode = { id: first.dealId, label: "Deal", name: first.deal };
    const steps = result.map((row) => {
      const scope =
        row.purpose === "transactional" || row.purpose === "marketing"
          ? row.consents.find(
              (consent) => consent.channel === row.channel && consent.purpose === row.purpose,
            )
          : undefined;
      const reachable =
        row.purpose === "internal"
          ? row.size
          : row.purpose === "public"
            ? null
            : (scope?.optedIn ?? 0);
      const blockers = releaseBlockers(row, { allowEmbargoed: true });
      if (row.segment && reachable === 0)
        blockers.push(
          `${row.segment} have no ${row.channel} ${row.purpose} consent with ${WEALTH_BRAND}`,
        );
      return {
        step: row.step,
        timing: row.timing,
        asset: row.asset,
        kind: row.kind,
        channel: row.channel,
        audience: row.segment ?? (row.purpose === "public" ? "Public (newswire)" : null),
        audienceSize: row.size,
        reliesOn:
          row.purpose === "transactional"
            ? `${row.channel} service notice (client agreement)`
            : row.purpose === "marketing"
              ? `${row.channel} marketing consent`
              : row.purpose === "internal"
                ? "internal audience"
                : "public release",
        reachable,
        approval: approvalSummary(row),
        disclosures: row.disclosures.map((disclosure) => disclosure.text),
        ready: blockers.length === 0,
        blockers,
      };
    });
    const paths: EvidencePath[] = [
      ...(first.firmId && first.firm
        ? [
            {
              nodes: [dealNode, { id: first.firmId, label: "Firm", name: first.firm }],
              relationships: [{ type: "ACQUIRES", from: dealNode.id, to: first.firmId }],
            },
          ]
        : []),
      ...result.flatMap((row) => {
        const asset = { id: row.assetId, label: "ContentAsset", name: row.asset };
        return [
          ...assetPaths(row, { node: dealNode, type: `RELEASED_WITH step ${row.step}` }),
          ...(row.segmentId && row.segment
            ? [
                {
                  nodes: [asset, { id: row.segmentId, label: "Segment", name: row.segment }],
                  relationships: [{ type: "ADDRESSED_TO", from: asset.id, to: row.segmentId }],
                },
              ]
            : []),
        ];
      }),
    ];
    return {
      deal: first.deal,
      dealStatus: first.dealStatus,
      acquiredFirm: first.firm,
      found: true,
      steps,
      readyCount: steps.filter((step) => step.ready).length,
      blockedCount: steps.filter((step) => !step.ready).length,
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

export const ACCOUNT_PLAN_CYPHER = `
MATCH (c:Client {dataset: $dataset, name: $client})
OPTIONAL MATCH (c)-[:COVERED_BY]->(adv:Advisor)
CALL (c) {
  OPTIONAL MATCH (c)-[h:HOLDS]->(p:Product)
  WITH p, h ORDER BY p.id
  RETURN collect(CASE WHEN p IS NULL THEN NULL ELSE {productId: p.id, product: p.name, aum: h.aum} END) AS holdings
}
CALL (c) {
  OPTIONAL MATCH (c)-[hs:HAS_SIGNAL]->(sig:Signal)-[sg:SUGGESTS]->(p:Product)
  WITH sig, hs, sg, p ORDER BY sig.id, p.id
  RETURN collect(CASE WHEN sig IS NULL THEN NULL ELSE {signalId: sig.id, signal: sig.name, detectedDaysAgo: hs.detectedDaysAgo, detail: hs.detail, productId: p.id, product: p.name, capture: sg.capture, why: sg.why} END) AS suggestions
}
CALL (c) {
  MATCH (peer:Client {dataset: $dataset})-[:HOLDS]->(p:Product)
  WHERE peer.clientType = c.clientType AND peer.id <> c.id
  WITH p, count(DISTINCT peer) AS holders ORDER BY p.id
  RETURN collect({productId: p.id, holders: holders}) AS peerHoldings
}
CALL (c) {
  OPTIONAL MATCH (peer:Client {dataset: $dataset})
  WHERE peer.clientType = c.clientType AND peer.id <> c.id
  RETURN count(peer) AS peerCount
}
CALL (c) {
  OPTIONAL MATCH (c)-[:HAS_SIGNAL]->(:Signal)-[:SUGGESTS]->(p:Product)<-[:EXPLAINS]-(a:ContentAsset)-[:APPROVED_UNDER]->(ap:Approval)
  WHERE NOT EXISTS { (a)-[:RESPONDS_TO]->(:MarketEvent) }
  WITH DISTINCT p, a, ap
  CALL (a) {
    OPTIONAL MATCH (a)-[:REQUIRES]->(d:Disclosure)
    WITH d ORDER BY d.id
    RETURN collect(d.text) AS disclosures
  }
  CALL (a) {
    OPTIONAL MATCH (a)-[:FAILED]->(r:BrandRule)
    WITH r ORDER BY r.name
    RETURN collect(r.name) AS failedRules
  }
  WITH p, a, ap, disclosures, failedRules ORDER BY p.id, a.id
  RETURN collect(CASE WHEN a IS NULL THEN NULL ELSE {productId: p.id, assetId: a.id, asset: a.name,
    channel: a.channel, approvalNodeId: ap.id, approvalId: ap.name, status: ap.status,
    approvedOn: ap.approvedOn, expiresOn: ap.expiresOn, embargoed: ap.embargoed,
    disclosures: disclosures, failedRules: failedRules} END) AS content
}
CALL (c) {
  OPTIONAL MATCH (per:Persona)-[:WORKS_AT]->(c)
  CALL (per) {
    OPTIONAL MATCH (per)-[:HAS_CONSENT]->(s:ConsentScope {purpose: "marketing"})
    WITH s ORDER BY s.channel
    RETURN collect(s.channel) AS channels
  }
  CALL (per) {
    OPTIONAL MATCH (per)-[e:ENGAGED_WITH]->(a:ContentAsset)
    WITH a, e ORDER BY a.id
    RETURN collect(CASE WHEN a IS NULL THEN NULL ELSE {assetId: a.id, asset: a.name, count: e.count, lastDaysAgo: e.lastDaysAgo} END) AS engaged
  }
  WITH per, channels, engaged ORDER BY per.id
  RETURN collect(CASE WHEN per IS NULL THEN NULL ELSE {personaId: per.id, persona: per.name, role: per.role, roleWeight: per.roleWeight, channels: channels, engaged: engaged} END) AS contacts
}
RETURN c.id AS clientId, c.name AS client, c.clientType AS clientType, c.aum AS aum,
  c.heldAwayEstimate AS heldAway, adv.id AS advisorId, adv.name AS advisor, adv.title AS advisorTitle,
  holdings, suggestions, peerHoldings, peerCount, content, contacts`;

type PlanContent = Omit<AssetFacts, "kind" | "disclosures"> & {
  productId: string;
  disclosures: string[];
};
type PlanRow = {
  clientId: string;
  client: string;
  clientType: string;
  aum: number;
  heldAway: number;
  advisorId: string | null;
  advisor: string | null;
  advisorTitle: string | null;
  holdings: Array<{ productId: string; product: string; aum: number }>;
  suggestions: Array<{
    signalId: string;
    signal: string;
    detectedDaysAgo: number;
    detail: string;
    productId: string;
    product: string;
    capture: number;
    why: string;
  }>;
  peerHoldings: Array<{ productId: string; holders: number }>;
  peerCount: number;
  content: PlanContent[];
  contacts: Array<{
    personaId: string;
    persona: string;
    role: string;
    roleWeight: number;
    channels: string[];
    engaged: Array<{ assetId: string; asset: string; count: number; lastDaysAgo: number }>;
  }>;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const buildAumAccountPlan = define({
  name: "build_aum_account_plan",
  title: "Build an account plan to grow assets under management",
  description: `For a ${WEALTH_BRAND} client (a foundation, business, or family office; never an individual): assets with ${WEALTH_BRAND} and the estimated assets held elsewhere, the signals the relationship team has seen, and the plays they point to (products the client doesn't hold yet, the estimated AUM opportunity, and how many similar clients already hold each), the pre-approved content for each play (usable or blocked, with approval IDs and disclosures), the advisor, and the client's contacts ranked by role and engagement with the marketing channels each has consented to. Each with its evidence path. Read-only.`,
  input: z.object({
    client: z.enum(CLIENT_NAMES).describe(`Fictional ${WEALTH_BRAND} client name`),
  }),
  run: async (backend, { client }) => {
    const [row] = (await rows(backend, ACCOUNT_PLAN_CYPHER, { client }, (ix) => {
      const clientNode = [...ix.byId.values()].find(
        (node) => node.label === "Client" && node.name === client,
      );
      if (!clientNode) return [];
      const advisorEdge = ix.outgoing(clientNode.id, "COVERED_BY")[0];
      const advisor = advisorEdge ? ix.node(advisorEdge.to) : null;
      const peers = [...ix.byId.values()].filter(
        (node) =>
          node.label === "Client" &&
          node.clientType === clientNode.clientType &&
          node.id !== clientNode.id,
      );
      const holders = new Map<string, number>();
      for (const peer of peers)
        for (const { to } of ix.outgoing(peer.id, "HOLDS"))
          holders.set(to, (holders.get(to) ?? 0) + 1);
      const suggestions = ix
        .outgoing(clientNode.id, "HAS_SIGNAL")
        .flatMap((has) => ix.outgoing(has.to, "SUGGESTS").map((suggests) => ({ has, suggests })))
        .sort((a, b) => byText(a.has.to, b.has.to) || byText(a.suggests.to, b.suggests.to))
        .map(({ has, suggests }) => ({
          signalId: has.to,
          signal: ix.node(has.to).name,
          detectedDaysAgo: Number(has.properties?.detectedDaysAgo),
          detail: String(has.properties?.detail),
          productId: suggests.to,
          product: ix.node(suggests.to).name,
          capture: Number(suggests.properties?.capture),
          why: String(suggests.properties?.why),
        }));
      const content = [...new Set(suggestions.map((entry) => entry.productId))]
        .flatMap((product) =>
          ix
            .incoming(product, "EXPLAINS")
            // News responses are timed to their event; plans use evergreen content only.
            .filter(({ from }) => ix.outgoing(from, "RESPONDS_TO").length === 0)
            .map(({ from }) => ({ product, facts: assetFacts(ix, from) })),
        )
        .sort((a, b) => byText(a.product, b.product) || byText(a.facts.assetId, b.facts.assetId))
        .map(({ product, facts }) => ({
          productId: product,
          assetId: facts.assetId,
          asset: facts.asset,
          channel: facts.channel,
          approvalNodeId: facts.approvalNodeId,
          approvalId: facts.approvalId,
          status: facts.status,
          approvedOn: facts.approvedOn,
          expiresOn: facts.expiresOn,
          embargoed: facts.embargoed,
          disclosures: facts.disclosures.map((disclosure) => disclosure.text),
          failedRules: facts.failedRules,
        }));
      const contacts = ix
        .incoming(clientNode.id, "WORKS_AT")
        .map(({ from }) => ix.node(from))
        .filter((node) => node.label === "Persona")
        .sort((a, b) => byText(a.id, b.id))
        .map((persona) => ({
          personaId: persona.id,
          persona: persona.name,
          role: String(persona.role),
          roleWeight: Number(persona.roleWeight),
          channels: ix
            .outgoing(persona.id, "HAS_CONSENT")
            .map(({ to }) => ix.node(to))
            .filter((scope) => scope.purpose === "marketing")
            .map((scope) => String(scope.channel))
            .sort(byText),
          engaged: ix
            .outgoing(persona.id, "ENGAGED_WITH")
            .sort((a, b) => byText(a.to, b.to))
            .map((edge) => ({
              assetId: edge.to,
              asset: ix.node(edge.to).name,
              count: Number(edge.properties?.count),
              lastDaysAgo: Number(edge.properties?.lastDaysAgo),
            })),
        }));
      return [
        {
          clientId: clientNode.id,
          client: clientNode.name,
          clientType: String(clientNode.clientType),
          aum: Number(clientNode.aum),
          heldAway: Number(clientNode.heldAwayEstimate),
          advisorId: advisor?.id ?? null,
          advisor: advisor?.name ?? null,
          advisorTitle: advisor ? String(advisor.title) : null,
          holdings: ix
            .outgoing(clientNode.id, "HOLDS")
            .sort((a, b) => byText(a.to, b.to))
            .map((edge) => ({
              productId: edge.to,
              product: ix.node(edge.to).name,
              aum: Number(edge.properties?.aum),
            })),
          suggestions,
          peerHoldings: [...holders.entries()]
            .sort(([a], [b]) => byText(a, b))
            .map(([productId, count]) => ({ productId, holders: count })),
          peerCount: peers.length,
          content,
          contacts,
        },
      ];
    })) as PlanRow[];
    if (!row) return { client, found: false, paths: [] };
    const held = new Set(row.holdings.map((holding) => holding.productId));
    const typeName = row.clientType.toLowerCase();
    const plays = new Map<
      string,
      {
        productId: string;
        product: string;
        capture: number;
        signals: Array<{ signalId: string; signal: string; detail: string; why: string }>;
      }
    >();
    for (const suggestion of row.suggestions) {
      if (held.has(suggestion.productId)) continue;
      const play = plays.get(suggestion.productId) ?? {
        productId: suggestion.productId,
        product: suggestion.product,
        capture: 0,
        signals: [],
      };
      play.capture = Math.max(play.capture, suggestion.capture);
      play.signals.push({
        signalId: suggestion.signalId,
        signal: suggestion.signal,
        detail: suggestion.detail,
        why: suggestion.why,
      });
      plays.set(suggestion.productId, play);
    }
    const ranked = [...plays.values()]
      .map((play) => {
        const holders =
          row.peerHoldings.find((entry) => entry.productId === play.productId)?.holders ?? 0;
        const content = row.content.filter((entry) => entry.productId === play.productId);
        const facts = (entry: PlanContent): AssetFacts => ({
          ...entry,
          kind: "Email",
          disclosures: [],
        });
        return {
          ...play,
          opportunity: round1(row.heldAway * play.capture),
          holders,
          usable: content.filter((entry) => releaseBlockers(facts(entry)).length === 0),
          blocked: content
            .filter((entry) => releaseBlockers(facts(entry)).length > 0)
            .map((entry) => ({ entry, reasons: releaseBlockers(facts(entry)) })),
        };
      })
      .sort((a, b) => b.opportunity - a.opportunity || byText(a.product, b.product));
    const playAssets = new Set(ranked.flatMap((play) => play.usable.map((entry) => entry.assetId)));
    const playChannels = new Set(
      ranked.flatMap((play) => play.usable.map((entry) => String(entry.channel))),
    );
    const contacts = row.contacts
      .map((contact) => {
        const relevant = contact.engaged.filter((entry) => playAssets.has(entry.assetId));
        return {
          ...contact,
          relevant,
          score:
            contact.roleWeight +
            relevant.reduce((sum, entry) => sum + entry.count, 0) * 2 +
            contact.engaged.length,
        };
      })
      .sort((a, b) => b.score - a.score || byText(a.persona, b.persona));
    const clientNode = { id: row.clientId, label: "Client", name: row.client };
    const paths: EvidencePath[] = [
      ...(row.advisorId && row.advisor
        ? [
            {
              nodes: [clientNode, { id: row.advisorId, label: "Advisor", name: row.advisor }],
              relationships: [{ type: "COVERED_BY", from: clientNode.id, to: row.advisorId }],
            },
          ]
        : []),
      ...ranked.flatMap((play) => {
        const product = { id: play.productId, label: "Product", name: play.product };
        const signal = play.signals[0] as { signalId: string; signal: string };
        const signalNode = { id: signal.signalId, label: "Signal", name: signal.signal };
        const asset = play.usable[0];
        return [
          {
            nodes: [clientNode, signalNode, product],
            relationships: [
              { type: "HAS_SIGNAL", from: clientNode.id, to: signalNode.id },
              { type: "SUGGESTS", from: signalNode.id, to: product.id },
            ],
          },
          ...(asset
            ? [
                {
                  nodes: [
                    { id: asset.assetId, label: "ContentAsset", name: asset.asset },
                    product,
                    { id: asset.approvalNodeId, label: "Approval", name: asset.approvalId },
                  ],
                  relationships: [
                    { type: "EXPLAINS", from: asset.assetId, to: product.id },
                    { type: "APPROVED_UNDER", from: asset.assetId, to: asset.approvalNodeId },
                  ],
                },
              ]
            : []),
        ];
      }),
      ...contacts.slice(0, 3).map((contact) => ({
        nodes: [{ id: contact.personaId, label: "Persona", name: contact.persona }, clientNode],
        relationships: [{ type: "WORKS_AT", from: contact.personaId, to: clientNode.id }],
      })),
    ];
    const total = round1(ranked.reduce((sum, play) => sum + play.opportunity, 0));
    return {
      client: row.client,
      clientType: row.clientType,
      found: true,
      advisor: row.advisor ? { name: row.advisor, title: row.advisorTitle } : null,
      aumWithFirmMillions: row.aum,
      heldAwayEstimateMillions: row.heldAway,
      walletShare: round4(row.aum / (row.aum + row.heldAway)),
      holdings: row.holdings.map((holding) => ({
        product: holding.product,
        aumMillions: holding.aum,
      })),
      signals: [
        ...new Map(
          row.suggestions.map((entry) => [
            entry.signalId,
            {
              signal: entry.signal,
              detail: entry.detail,
              detectedDaysAgo: entry.detectedDaysAgo,
            },
          ]),
        ).values(),
      ].sort((a, b) => a.detectedDaysAgo - b.detectedDaysAgo || byText(a.signal, b.signal)),
      plays: ranked.map((play) => ({
        product: play.product,
        why: play.signals.map((signal) => `${signal.why} (${signal.detail})`),
        estimatedOpportunityMillions: play.opportunity,
        peerAdoption: `${play.holders} of ${row.peerCount} other ${typeName} clients hold it`,
        approvedContent: play.usable.map((entry) => ({
          asset: entry.asset,
          channel: entry.channel,
          approval: { id: entry.approvalId, expiresOn: entry.expiresOn },
          disclosures: entry.disclosures,
        })),
        blockedContent: play.blocked.map(({ entry, reasons }) => ({
          asset: entry.asset,
          reasons,
        })),
      })),
      totalOpportunityMillions: total,
      contacts: contacts.map((contact) => ({
        persona: contact.persona,
        role: contact.role,
        reachableBy: contact.channels,
        // Approved play content goes only on a channel it's approved for and they consented to.
        channelForPlayContent:
          contact.channels.find((channel) => playChannels.has(channel)) ?? null,
        engagedWithPlayContent: contact.relevant.map((entry) => entry.asset),
      })),
      notReachable: contacts
        .filter((contact) => contact.channels.length === 0)
        .map((contact) => contact.persona),
      noApprovedContentForTheirChannels: contacts
        .filter(
          (contact) =>
            contact.channels.length > 0 &&
            !contact.channels.some((channel) => playChannels.has(channel)),
        )
        .map((contact) => contact.persona),
      paths: paths.slice(0, MAX_PATHS),
    };
  },
});

/** Every tool the workbench can offer; the Learn gate and the tool checks cover all of them. */
export const ALL_KNOWLEDGE_GRAPH_TOOL_SPECS = [
  getGraphOverview,
  explainBuyerGroup,
  findAudienceOverlap,
  checkConsentCoverage,
  findSimilarPastPushes,
  traceContentLineage,
  planAccountOutreach,
  assessLocationImpact,
  mapWeatherDemand,
  matchNewsToApprovedContent,
  prepareDealRelease,
  buildAumAccountPlan,
] as const;

/** Tools that only make sense when a vertical module's data is in the graph. */
export const TOOL_MODULE: Partial<Record<string, "restaurant" | "wealth">> = {
  find_similar_past_pushes: "restaurant",
  assess_location_impact: "restaurant",
  map_weather_demand: "restaurant",
  match_news_to_approved_content: "wealth",
  prepare_deal_release: "wealth",
  build_aum_account_plan: "wealth",
};

/** The tools this instance's industry pack enables. */
export const KNOWLEDGE_GRAPH_TOOL_SPECS = ALL_KNOWLEDGE_GRAPH_TOOL_SPECS.filter((spec) => {
  const module = TOOL_MODULE[spec.name];
  return !module || INSTANCE_PACK.modules[module];
});

export { pathNode };
