// Loads the fictional Northstar knowledge graph into Neo4j through the Query API.
// Usage: pnpm kg:seed --confirm [--reset]
// Credentials: NEO4J_QUERY_URL, NEO4J_USERNAME, NEO4J_PASSWORD (never printed).
import {
  buildDataset,
  DATASET_VERSION,
  OVERVIEW_CYPHER,
  queryApiBackend,
} from "../packages/knowledge-graph/src/index.ts";

const args = new Set(process.argv.slice(2));
const { NEO4J_QUERY_URL: url, NEO4J_USERNAME: username, NEO4J_PASSWORD: password } = process.env;
if (!url || !username || !password) {
  console.error("Set NEO4J_QUERY_URL, NEO4J_USERNAME, and NEO4J_PASSWORD.");
  process.exit(2);
}
const host = new URL(url).host;
if (!args.has("--confirm")) {
  console.error(`Refusing to write to ${host} without --confirm.`);
  process.exit(2);
}

const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
async function write(statement, parameters = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ statement, parameters }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors?.length)
    throw new Error(`Neo4j write failed: ${body.errors?.[0]?.code ?? response.status}`);
  return body;
}

const IDENTIFIER = /^[A-Za-z][A-Za-z_]*$/;
const safe = (value) => {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return value;
};
const chunks = (items, size = 500) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );

const dataset = buildDataset();
const labelOf = new Map(dataset.nodes.map((node) => [node.id, node.label]));
const labels = [...new Set(dataset.nodes.map((node) => node.label))].sort();

console.log(`Seeding ${DATASET_VERSION} into ${host}…`);
for (const label of labels)
  await write(
    `CREATE CONSTRAINT kg_${safe(label).toLowerCase()}_id IF NOT EXISTS FOR (n:${safe(label)}) REQUIRE n.id IS UNIQUE`,
  );
if (args.has("--reset"))
  await write("MATCH (n {dataset: $dataset}) DETACH DELETE n", { dataset: DATASET_VERSION });

for (const label of labels) {
  const rows = dataset.nodes
    .filter((node) => node.label === label)
    .map(({ label: _label, ...properties }) => ({ ...properties, dataset: DATASET_VERSION }));
  for (const batch of chunks(rows))
    await write(`UNWIND $rows AS row MERGE (n:${safe(label)} {id: row.id}) SET n = row`, {
      rows: batch,
    });
}

const groups = new Map();
for (const relationship of dataset.relationships) {
  const key = [
    relationship.type,
    labelOf.get(relationship.from),
    labelOf.get(relationship.to),
  ].join("|");
  groups.set(key, [...(groups.get(key) ?? []), relationship]);
}
for (const [key, relationships] of groups) {
  const [type, fromLabel, toLabel] = key.split("|");
  for (const batch of chunks(relationships))
    await write(
      `UNWIND $rows AS row
       MATCH (a:${safe(fromLabel)} {id: row.from}) MATCH (b:${safe(toLabel)} {id: row.to})
       MERGE (a)-[r:${safe(type)}]->(b) SET r = row.properties`,
      {
        rows: batch.map((relationship) => ({
          ...relationship,
          properties: relationship.properties ?? {},
        })),
      },
    );
}

const [overview] = await queryApiBackend({ url, username, password }).query(OVERVIEW_CYPHER, {
  dataset: DATASET_VERSION,
});
const nodes = overview.nodeCounts.reduce((sum, row) => sum + row.count, 0);
const relationships = overview.relationshipCounts.reduce((sum, row) => sum + row.count, 0);
console.log(
  `Read back ${nodes} nodes and ${relationships} relationships (expected ${dataset.nodes.length} and ${dataset.relationships.length}).`,
);
if (nodes !== dataset.nodes.length || relationships !== dataset.relationships.length)
  process.exit(1);
