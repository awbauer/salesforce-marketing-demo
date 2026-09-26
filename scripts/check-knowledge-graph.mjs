// Proves the Neo4j Cypher and the fixture backend return the same results for every graph tool.
// Usage: pnpm kg:parity   (needs NEO4J_QUERY_URL, NEO4J_USERNAME, NEO4J_PASSWORD; read-only)
import { isDeepStrictEqual } from "node:util";
import {
  ACCOUNTS,
  buildDataset,
  CAMPAIGNS,
  KNOWLEDGE_GRAPH_TOOL_SPECS,
  queryApiBackend,
} from "../packages/knowledge-graph/src/index.ts";

const { NEO4J_QUERY_URL: url, NEO4J_USERNAME: username, NEO4J_PASSWORD: password } = process.env;
if (!url || !username || !password) {
  console.error("Set NEO4J_QUERY_URL, NEO4J_USERNAME, and NEO4J_PASSWORD.");
  process.exit(2);
}
const live = queryApiBackend({ url, username, password });
const fixture = { kind: "fixture", dataset: buildDataset() };
const cases = {
  get_graph_overview: [{}],
  explain_buyer_group: [ACCOUNTS[0], ACCOUNTS[5], ACCOUNTS[11]].map((account) => ({
    account,
    limit: 5,
  })),
  find_audience_overlap: CAMPAIGNS.map((campaign) => ({ campaign: campaign.id })),
  check_consent_coverage: [
    { campaign: "camp-fall", channel: "email" },
    { campaign: "camp-holiday", channel: "sms" },
    { campaign: "camp-winter", channel: "push" },
  ],
  find_similar_past_pushes: [
    { location: "los-angeles", daypart: "dinner", condition: "clear" },
    { location: "san-francisco", daypart: "late-night", condition: "fog" },
    { location: "fresno", daypart: "afternoon", condition: "heat" },
    { location: "san-diego", daypart: "breakfast", condition: "rain" },
  ],
  trace_content_lineage: CAMPAIGNS.map((campaign) => ({ campaign: campaign.id })),
};

// Averages can differ in the last floating-point digits by summation order.
const normalize = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "number" ? Math.round(item * 1e6) / 1e6 : item,
    ),
  );

let failures = 0;
for (const spec of KNOWLEDGE_GRAPH_TOOL_SPECS) {
  for (const input of cases[spec.name]) {
    const parsed = spec.input.parse(input);
    const started = Date.now();
    const [liveResult, fixtureResult] = [
      await spec.run(live, parsed),
      await spec.run(fixture, parsed),
    ];
    const ms = Date.now() - started;
    const same = isDeepStrictEqual(normalize(liveResult), normalize(fixtureResult));
    if (!same) failures += 1;
    console.log(`${same ? "match " : "DIFFER"} ${spec.name} ${JSON.stringify(input)} (${ms} ms)`);
    if (!same) {
      console.log("  neo4j:  ", JSON.stringify(normalize(liveResult)).slice(0, 600));
      console.log("  fixture:", JSON.stringify(normalize(fixtureResult)).slice(0, 600));
    }
  }
}
console.log(
  failures ? `${failures} mismatches` : "All graph tools match between Neo4j and the fixture.",
);
process.exit(failures ? 1 : 0);
