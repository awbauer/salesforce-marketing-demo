import { describe, expect, it } from "vitest";
import { buildDataset, DATASET_VERSION } from "./dataset";
import { queryApiBackend } from "./query-api";
import { type GraphBackend, KNOWLEDGE_GRAPH_TOOL_SPECS } from "./tools";

const fixture: GraphBackend = { kind: "fixture", dataset: buildDataset() };
const tool = (name: string) => {
  const spec = KNOWLEDGE_GRAPH_TOOL_SPECS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(name);
  return (input: Record<string, unknown>) => spec.run(fixture, spec.input.parse(input) as never);
};

describe("knowledge graph dataset", () => {
  it("is deterministic and inside Aura Free limits", () => {
    const first = buildDataset();
    expect(buildDataset()).toEqual(first);
    expect(first.nodes.length).toBeLessThan(200_000);
    expect(first.relationships.length).toBeLessThan(400_000);
    expect(new Set(first.nodes.map((node) => node.id)).size).toBe(first.nodes.length);
    const ids = new Set(first.nodes.map((node) => node.id));
    expect(first.relationships.every((rel) => ids.has(rel.from) && ids.has(rel.to))).toBe(true);
  });

  it("contains no contact data: personas are roles and names carry no emails or phones", () => {
    const text = JSON.stringify(buildDataset());
    expect(text).not.toMatch(/@[\w-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}/);
  });
});

describe("knowledge graph tools (fixture backend)", () => {
  it("favors cold items on hot afternoons and hot items on rainy nights", async () => {
    const heat = (await tool("find_similar_past_pushes")({
      location: "fresno",
      daypart: "afternoon",
      condition: "heat",
    })) as { topItems: Array<{ serves: string }>; bestAngle: string };
    expect(heat.topItems.map((item) => item.serves)).toEqual(["cold", "cold", "cold"]);
    expect(heat.bestAngle).toBe("Beat the heat");
    const rain = (await tool("find_similar_past_pushes")({
      location: "san-francisco",
      daypart: "late-night",
      condition: "rain",
    })) as { topItems: Array<{ serves: string }> };
    expect(rain.topItems.every((item) => item.serves === "hot")).toBe(true);
  });

  it("shows the fall hero email failing alt text, matching the readiness blocker", async () => {
    const lineage = (await tool("trace_content_lineage")({ campaign: "camp-fall" })) as {
      assets: Array<{ kind: string; failed: string[] }>;
    };
    expect(lineage.assets.find((asset) => asset.kind === "Hero email")?.failed).toContain(
      "Accessible alt text",
    );
  });

  it("returns bounded evidence paths whose nodes exist in the dataset", async () => {
    const ids = new Set(buildDataset().nodes.map((node) => node.id));
    for (const [name, input] of [
      ["explain_buyer_group", { account: "Acme Outfitters" }],
      ["find_audience_overlap", { campaign: "camp-fall" }],
      ["check_consent_coverage", { campaign: "camp-fall", channel: "email" }],
      ["trace_content_lineage", { campaign: "camp-winter" }],
    ] as const) {
      const result = (await tool(name)(input)) as {
        paths: Array<{ nodes: Array<{ id: string }>; relationships: unknown[] }>;
      };
      expect(result.paths.length, name).toBeGreaterThan(0);
      expect(result.paths.length, name).toBeLessThanOrEqual(25);
      for (const path of result.paths)
        for (const node of path.nodes) expect(ids.has(node.id), node.id).toBe(true);
    }
  });

  it("rejects inputs outside the curated schemas", () => {
    const spec = KNOWLEDGE_GRAPH_TOOL_SPECS.find(
      (candidate) => candidate.name === "explain_buyer_group",
    );
    expect(() => spec?.input.parse({ account: "MATCH (n) DETACH DELETE n" })).toThrow();
  });
});

describe("Neo4j Query API client", () => {
  it("sends read-mode, parameterized statements with basic auth and maps rows", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const backend = queryApiBackend(
      { url: "https://example.databases.neo4j.io/db/x/query/v2", username: "u", password: "p" },
      async (url, init) => {
        captured = { url: String(url), init: init as RequestInit };
        return new Response(JSON.stringify({ data: { fields: ["a", "b"], values: [[1, "x"]] } }), {
          status: 202,
        });
      },
    );
    await expect(
      backend.query("RETURN $a AS a", { a: 1, dataset: DATASET_VERSION }),
    ).resolves.toEqual([{ a: 1, b: "x" }]);
    const body = JSON.parse(String(captured?.init.body));
    expect(body).toMatchObject({ accessMode: "Read", parameters: { a: 1 } });
    expect(new Headers(captured?.init.headers).get("authorization")).toBe(`Basic ${btoa("u:p")}`);
  });

  it("reports failures without echoing credentials", async () => {
    const failing = (status: number, code?: string) =>
      queryApiBackend(
        { url: "https://h/db/x/query/v2", username: "user", password: "secret-pass" },
        async () =>
          new Response(
            JSON.stringify(code ? { errors: [{ code, message: "secret-pass leaked" }] } : {}),
            {
              status,
            },
          ),
      );
    await expect(failing(401).query("RETURN 1", {})).rejects.toThrow(
      "Neo4j rejected the credentials",
    );
    await expect(
      failing(400, "Neo.ClientError.Statement.AccessMode").query("CREATE (n)", {}),
    ).rejects.toThrow("Neo4j query failed (Neo.ClientError.Statement.AccessMode)");
    await expect(
      failing(503, "Neo.TransientError.General.DatabaseUnavailable").query("RETURN 1", {}),
    ).rejects.toThrow("may be paused");
    await failing(400, "X")
      .query("RETURN 1", {})
      .catch((error: Error) => {
        expect(error.message).not.toContain("secret-pass");
      });
  });
});
