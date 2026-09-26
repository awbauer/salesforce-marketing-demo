import { z } from "zod";
import { DAYPARTS } from "./coastline.ts";
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

export type Row = Record<string, unknown>;
export type PathNode = { id: string; label: string; name: string };
export type PathRelationship = { type: string; from: string; to: string };
export type EvidencePath = { nodes: PathNode[]; relationships: PathRelationship[] };

/** Runs a read-only statement; the Neo4j backend and the fixture backend implement this. */
export type GraphBackend =
  | { kind: "neo4j"; query: (statement: string, parameters: Row) => Promise<Row[]> }
  | { kind: "fixture"; dataset: Dataset };

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
    "Summarize what the Northstar marketing knowledge graph contains: node counts by label, relationship counts by type, and the dataset version. All data is fictional.",
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
  description: `Check how much of a campaign's audience holds the marketing consent a channel requires: individual personas for B2B campaigns, and aggregate app-user segments (push opt-ins) for Coastline Kitchen's mobile app campaigns, with the members or segments that fall short. Channels: email, sms, mobile-app (push notifications). Read-only; never changes consent or suppressions. Campaigns: ${campaignHelp}.`,
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

export const PUSH_HISTORY_CYPHER = `
MATCH (s:PushSend {dataset: $dataset})-[:FOR]->(:Location {id: $locationId}),
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
MATCH (seg)-[hc:HAS_CONSENT]->(scope:ConsentScope)
RETURN seg.id AS segmentId, seg.name AS segment, seg.size AS appUsers, hc.optedIn AS optedIn,
  scope.id AS scopeId, scope.name AS scope`;

const round4 = (value: number) => Math.round(value * 10000) / 10000;

const findSimilarPastPushes = define({
  name: "find_similar_past_pushes",
  title: "Find similar past pushes",
  description:
    "Look up Coastline Kitchen's fictional push history for the same location, daypart, and weather condition, and return the best-performing menu items and message angle by average order rate. Condition must be clear, cloudy, fog, rain, or heat (use heat when feels-like is 85°F or more; rain for drizzle or storms). If fewer than 5 matching sends exist, it widens to all weather for that location and daypart.",
  input: z.object({
    location: z.enum(LOCATION_IDS).describe("Restaurant location (same IDs as the weather tool)"),
    daypart: z.enum(DAYPARTS).describe("Local daypart"),
    condition: z.enum(CONDITIONS).describe("Weather bucket"),
  }),
  run: async (backend, { location, daypart, condition }) => {
    const query = (conditionId: string | null) =>
      rows(
        backend,
        PUSH_HISTORY_CYPHER,
        { locationId: `location-${location}`, daypartId: `daypart-${daypart}`, conditionId },
        (ix) => {
          const groups = new Map<string, { item: GraphNode; sends: GraphNode[] }>();
          for (const send of [...ix.byId.values()].filter((node) => node.label === "PushSend")) {
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
      { locationId: `location-${location}` },
      (ix) =>
        ix.incoming(`location-${location}`, "NEAR").flatMap(({ from: segmentId }) =>
          ix.outgoing(segmentId, "HAS_CONSENT").map((consent) => ({
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
        label: "PushSend",
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
    if (audience && exampleSend)
      paths.push({
        nodes: [
          { id: exampleSend, label: "PushSend", name: "Push send" },
          { id: audience.segmentId, label: "Segment", name: audience.segment },
          { id: audience.scopeId, label: "ConsentScope", name: audience.scope },
        ],
        relationships: [
          { type: "SENT_TO", from: exampleSend, to: audience.segmentId },
          {
            type: `HAS_CONSENT ${Number(audience.optedIn).toLocaleString("en-US")} opted in`,
            from: audience.segmentId,
            to: audience.scopeId,
          },
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
      audience: audience
        ? {
            segment: audience.segment,
            appUsers: Number(audience.appUsers),
            pushOptIns: Number(audience.optedIn),
            consentScope: audience.scope,
          }
        : null,
      note: "Fictional push history for demonstration.",
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

export const KNOWLEDGE_GRAPH_TOOL_SPECS = [
  getGraphOverview,
  explainBuyerGroup,
  findAudienceOverlap,
  checkConsentCoverage,
  findSimilarPastPushes,
  traceContentLineage,
] as const;

export { pathNode };
