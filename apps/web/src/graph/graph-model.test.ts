import { describe, expect, it } from "vitest";
import { connectionsOf, DOMAINS, LABEL_COLORS, mergeGraph, pushInsight } from "./graph-model";

const node = (id: string, label: string, properties: Record<string, unknown> = {}) => ({
  id,
  label,
  name: id,
  properties,
});
const link = (from: string, type: string, to: string) => ({ from, type, to, properties: {} });

describe("graph model", () => {
  it("colors and groups every node type exactly once", () => {
    const labels = DOMAINS.flatMap((domain) => domain.labels);
    expect(new Set(labels).size).toBe(labels.length);
    expect(Object.keys(LABEL_COLORS).sort()).toEqual([...labels].sort());
  });

  it("merges without duplicates and keeps degree current", () => {
    let graph = mergeGraph(
      { nodes: [], links: [] },
      [node("a", "Campaign"), node("b", "Brief")],
      [link("b", "FOR", "a")],
    );
    graph = mergeGraph(
      graph,
      [node("a", "Campaign"), node("c", "Segment")],
      [link("b", "FOR", "a"), link("a", "TARGETS", "c"), link("a", "USES", "missing")],
    );
    expect(graph.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(graph.links).toHaveLength(2);
    expect(graph.nodes.find((n) => n.id === "a")?.degree).toBe(2);
  });

  it("groups connections by direction and type", () => {
    const graph = mergeGraph(
      { nodes: [], links: [] },
      [node("a", "Campaign"), node("b", "Brief"), node("c", "Segment"), node("d", "Segment")],
      [link("b", "FOR", "a"), link("a", "TARGETS", "c"), link("a", "TARGETS", "d")],
    );
    expect(
      connectionsOf(graph, "a").map((g) => [g.direction, g.type, g.nodes.map((n) => n.id)]),
    ).toEqual([
      ["out", "TARGETS", ["c", "d"]],
      ["in", "FOR", ["b"]],
    ]);
  });

  it("summarizes loaded pushes as average order rate per menu item", () => {
    const pushes = [
      node("p1", "PushSend", { orderRate: 0.08 }),
      node("p2", "PushSend", { orderRate: 0.06 }),
      node("p3", "PushSend", { orderRate: 0.03 }),
    ];
    const graph = mergeGraph(
      { nodes: [], links: [] },
      [
        node("rain", "WeatherCondition"),
        node("bowl", "MenuItem"),
        node("soup", "MenuItem"),
        ...pushes,
      ],
      [
        ...pushes.map((push) => link(push.id, "UNDER", "rain")),
        link("p1", "FEATURED", "bowl"),
        link("p2", "FEATURED", "bowl"),
        link("p3", "FEATURED", "soup"),
      ],
    );
    const insight = pushInsight(graph, "rain");
    expect(insight?.pushes).toBe(3);
    expect(insight?.rows.map((row) => [row.id, Number(row.average.toFixed(2)), row.count])).toEqual(
      [
        ["bowl", 0.07, 2],
        ["soup", 0.03, 1],
      ],
    );
    expect(pushInsight(graph, "bowl")).toBeNull();
  });
});
