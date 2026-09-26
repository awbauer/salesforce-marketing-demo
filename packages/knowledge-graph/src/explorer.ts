import type { GraphBackend, Row } from "./tools.ts";

/**
 * Read-only snapshots of the knowledge graph for the Graph explorer page. The overview returns
 * every node except the high-volume push sends; neighbors expands one node at a time. Both run
 * fixed, parameterized Cypher against Neo4j, or the same logic against the in-memory fixture.
 */

export const EXPLORER_HIDDEN_LABELS = ["PushSend"] as const;
export const EXPLORER_NEIGHBOR_LIMIT = 60;
export const EXPLORER_MAX_ROWS = 5_000;
const NODE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export type ExplorerNode = {
  id: string;
  label: string;
  name: string;
  properties: Record<string, unknown>;
};
export type ExplorerRelationship = {
  type: string;
  from: string;
  to: string;
  properties: Record<string, unknown>;
};
export type GraphOverview = {
  source: GraphBackend["kind"];
  nodes: ExplorerNode[];
  relationships: ExplorerRelationship[];
  labelCounts: Record<string, number>;
  relationshipCounts: Record<string, number>;
  hiddenLabels: string[];
};
export type GraphNeighbors = {
  source: GraphBackend["kind"];
  node: ExplorerNode;
  nodes: ExplorerNode[];
  /** Links to the expanded node, plus each neighbor's links to overview (non-hidden) nodes. */
  relationships: ExplorerRelationship[];
  total: number;
  truncated: boolean;
};

export class GraphNodeNotFoundError extends Error {}

// Seeding stamps every node with the dataset version; identity fields are shown separately.
function cleanProperties(properties: unknown): Record<string, unknown> {
  if (!properties || typeof properties !== "object") return {};
  const { id: _id, name: _name, label: _label, dataset: _dataset, ...rest } = properties as Row;
  return rest;
}

function toNode(row: Row): ExplorerNode {
  return {
    id: String(row.id),
    label: String(row.label),
    name: String(row.name ?? row.id),
    properties: cleanProperties(row.properties),
  };
}

function toRelationship(row: Row): ExplorerRelationship {
  return {
    type: String(row.type),
    from: String(row.from),
    to: String(row.to),
    properties: cleanProperties(row.relationshipProperties ?? row.properties),
  };
}

const byLabelThenName = (a: ExplorerNode, b: ExplorerNode) =>
  a.label.localeCompare(b.label) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// Neighbors come back best performing first, so the first page of a large expansion (such as
// every push sent in the rain) shows what worked; nodes without an order rate follow by name.
const orderRate = (node: { properties: Record<string, unknown> }) =>
  typeof node.properties.orderRate === "number" ? node.properties.orderRate : -1;
const byNeighborOrder = (a: ExplorerNode, b: ExplorerNode) =>
  orderRate(b) - orderRate(a) || byLabelThenName(a, b);

const relationshipKey = (edge: { from: string; type: string; to: string }) =>
  `${edge.from}|${edge.type}|${edge.to}`;

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

export async function graphOverview(backend: GraphBackend): Promise<GraphOverview> {
  const hidden = new Set<string>(EXPLORER_HIDDEN_LABELS);
  if (backend.kind === "fixture") {
    const { nodes, relationships } = backend.dataset;
    const visible = nodes.filter((node) => !hidden.has(node.label));
    const ids = new Set(visible.map((node) => node.id));
    return {
      source: "fixture",
      nodes: visible.map((node) => toNode({ ...node, properties: node })).sort(byLabelThenName),
      relationships: relationships
        .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
        .map((edge) => toRelationship({ ...edge, properties: edge.properties })),
      labelCounts: countBy(nodes, (node) => node.label),
      relationshipCounts: countBy(relationships, (edge) => edge.type),
      hiddenLabels: [...hidden],
    };
  }
  const hiddenLabels = [...hidden];
  const [nodeRows, relationshipRows, labelRows, typeRows] = await Promise.all([
    backend.query(
      `MATCH (n) WHERE NONE(label IN labels(n) WHERE label IN $hidden)
       RETURN n.id AS id, labels(n)[0] AS label, n.name AS name, properties(n) AS properties
       ORDER BY label, name LIMIT 2000`,
      { hidden: hiddenLabels },
    ),
    backend.query(
      `MATCH (a)-[r]->(b)
       WHERE NONE(label IN labels(a) WHERE label IN $hidden)
         AND NONE(label IN labels(b) WHERE label IN $hidden)
       RETURN a.id AS from, type(r) AS type, b.id AS to, properties(r) AS properties
       LIMIT 5000`,
      { hidden: hiddenLabels },
    ),
    backend.query("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count", {}),
    backend.query("MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count", {}),
  ]);
  return {
    source: "neo4j",
    nodes: nodeRows.map(toNode).sort(byLabelThenName),
    relationships: relationshipRows.map(toRelationship),
    labelCounts: Object.fromEntries(labelRows.map((row) => [String(row.label), Number(row.count)])),
    relationshipCounts: Object.fromEntries(
      typeRows.map((row) => [String(row.type), Number(row.count)]),
    ),
    hiddenLabels,
  };
}

function dedupe(relationships: ExplorerRelationship[]) {
  const seen = new Set<string>();
  return relationships.filter((edge) => {
    const key = relationshipKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function graphNeighbors(
  backend: GraphBackend,
  id: string,
  limit = EXPLORER_NEIGHBOR_LIMIT,
): Promise<GraphNeighbors> {
  if (!NODE_ID.test(id)) throw new GraphNodeNotFoundError("Unknown graph node.");
  if (backend.kind === "fixture") {
    const { nodes, relationships } = backend.dataset;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const self = byId.get(id);
    if (!self) throw new GraphNodeNotFoundError("Unknown graph node.");
    const touching = relationships
      .filter((edge) => edge.from === id || edge.to === id)
      .map((edge) => {
        const other = byId.get(edge.from === id ? edge.to : edge.from);
        return other ? { edge, other: toNode({ ...other, properties: other }) } : null;
      })
      .filter((entry) => entry !== null)
      .sort((a, b) => byNeighborOrder(a.other, b.other));
    const kept = touching.slice(0, limit);
    const keptIds = new Set(kept.map((entry) => entry.other.id));
    const hidden = new Set<string>(EXPLORER_HIDDEN_LABELS);
    const context = relationships.filter((edge) => {
      const [inner, outer] = keptIds.has(edge.from) ? [edge.from, edge.to] : [edge.to, edge.from];
      const other = byId.get(outer);
      return keptIds.has(inner) && other !== undefined && !hidden.has(other.label);
    });
    return {
      source: "fixture",
      node: toNode({ ...self, properties: self }),
      nodes: kept.map((entry) => entry.other),
      relationships: dedupe(
        [...kept.map(({ edge }) => edge), ...context].map((edge) =>
          toRelationship({ ...edge, properties: edge.properties }),
        ),
      ),
      total: touching.length,
      truncated: touching.length > kept.length,
    };
  }
  const hiddenLabels = [...EXPLORER_HIDDEN_LABELS];
  const [selfRows, neighborRows, totalRows] = await Promise.all([
    backend.query(
      "MATCH (n {id: $id}) RETURN n.id AS id, labels(n)[0] AS label, n.name AS name, properties(n) AS properties LIMIT 1",
      { id },
    ),
    backend.query(
      `MATCH (n {id: $id})-[r]-(m)
       RETURN startNode(r).id AS from, type(r) AS type, endNode(r).id AS to,
              properties(r) AS relationshipProperties,
              m.id AS id, labels(m)[0] AS label, m.name AS name, properties(m) AS properties
       ORDER BY coalesce(m.orderRate, -1) DESC, label, name, id LIMIT $limit`,
      { id, limit },
    ),
    backend.query("MATCH (n {id: $id})-[r]-() RETURN count(r) AS total", { id }),
  ]);
  const self = selfRows[0];
  if (!self) throw new GraphNodeNotFoundError("Unknown graph node.");
  const total = Number(totalRows[0]?.total ?? neighborRows.length);
  const neighborIds = neighborRows.map((row) => String(row.id));
  const contextRows = neighborIds.length
    ? await backend.query(
        `MATCH (m)-[r]-(o)
         WHERE m.id IN $ids AND NONE(label IN labels(o) WHERE label IN $hidden)
         RETURN DISTINCT startNode(r).id AS from, type(r) AS type, endNode(r).id AS to,
                properties(r) AS properties`,
        { ids: neighborIds, hidden: hiddenLabels },
      )
    : [];
  return {
    source: "neo4j",
    node: toNode(self),
    nodes: neighborRows.map(toNode),
    relationships: dedupe([
      ...neighborRows.map(toRelationship),
      ...contextRows.map(toRelationship),
    ]),
    total,
    truncated: total > neighborRows.length,
  };
}
