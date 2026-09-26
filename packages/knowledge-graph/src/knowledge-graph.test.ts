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
    expect(heat.topItems[0]?.serves).toBe("cold");
    expect(heat.topItems.filter((item) => item.serves === "cold").length).toBeGreaterThanOrEqual(2);
    expect(heat.bestAngle).toBe("Beat the heat");
    const rain = (await tool("find_similar_past_pushes")({
      location: "san-francisco",
      daypart: "late-night",
      condition: "rain",
    })) as { topItems: Array<{ serves: string }> };
    expect(rain.topItems[0]?.serves).toBe("hot");
    expect(rain.topItems.filter((item) => item.serves === "hot").length).toBeGreaterThanOrEqual(2);
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

  it("connects Coastline Kitchen to Northstar and every push to its campaign, content, audience, and consent", () => {
    const dataset = buildDataset();
    const out = (id: string, type: string) =>
      dataset.relationships
        .filter((edge) => edge.from === id && edge.type === type)
        .map((edge) => edge.to);
    expect(out("brand-coastline-kitchen", "PART_OF")).toEqual(["brand-northstar"]);
    expect(out("consent-push-marketing", "FOR")).toEqual(["channel-mobile-app"]);
    const pushes = dataset.nodes.filter((node) => node.label === "PushSend");
    expect(pushes).toHaveLength(1500);
    for (const push of pushes) {
      expect(out(push.id, "ON")).toEqual(["channel-mobile-app"]);
      expect(out(push.id, "SENT_UNDER")).toEqual(["consent-push-marketing"]);
      expect(out(push.id, "PART_OF")[0]).toMatch(/^camp-coastline-/);
      expect(out(push.id, "USED")[0]).toMatch(/^asset-camp-coastline-/);
      expect(out(push.id, "SENT_TO")[0]).toMatch(/^segment-coastline-/);
    }
    // Restaurant entities belong to the brand: locations it operates and one menu they serve.
    expect(out("brand-coastline-kitchen", "OPERATES")).toHaveLength(5);
    expect(out("location-los-angeles", "SERVES")).toEqual(["menu-coastline-core"]);
    expect(
      dataset.relationships.filter(
        (edge) => edge.type === "ON_MENU" && edge.to === "menu-coastline-core",
      ),
    ).toHaveLength(10);
  });

  it("reports push consent for Coastline's app audiences from segment aggregates", async () => {
    const coverage = (await tool("check_consent_coverage")({
      campaign: "camp-coastline-late-night",
      channel: "push",
    })) as {
      channel: string;
      requiredScope: string;
      campaignUsesChannel: boolean;
      audience: number;
      covered: number;
      segments: unknown[];
      paths: Array<{ nodes: Array<{ label: string }> }>;
    };
    expect(coverage.channel).toBe("mobile-app");
    expect(coverage.requiredScope).toBe("push marketing");
    expect(coverage.campaignUsesChannel).toBe(true);
    expect(coverage.audience).toBe(51200);
    expect(coverage.covered).toBe(31700);
    expect(coverage.segments).toHaveLength(5);
    expect(coverage.paths[0]?.nodes.map((node) => node.label)).toEqual([
      "Campaign",
      "Segment",
      "ConsentScope",
    ]);
  });

  it("returns the push content and consented app audience behind similar past pushes", async () => {
    const result = (await tool("find_similar_past_pushes")({
      location: "los-angeles",
      daypart: "lunch",
      condition: "rain",
    })) as {
      topItems: Array<{ content: string | null }>;
      audience: { segment: string; pushOptIns: number; consentScope: string };
      paths: Array<{ relationships: Array<{ type: string }> }>;
    };
    expect(result.topItems.every((item) => item.content?.endsWith("· push"))).toBe(true);
    expect(result.audience).toEqual({
      segment: "Coastline app · Los Angeles",
      appUsers: 18400,
      pushOptIns: 11900,
      consentScope: "push marketing",
    });
    const types = result.paths.flatMap((path) => path.relationships.map((edge) => edge.type));
    expect(types).toEqual(expect.arrayContaining(["FEATURED", "USED", "SENT_TO"]));
  });
});
