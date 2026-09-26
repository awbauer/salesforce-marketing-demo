import type { UIMessage } from "ai";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraphEvidencePanel, graphEvidence } from "./GraphEvidence";

const message = {
  id: "a1",
  role: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "graph_explain_buyer_group",
      toolCallId: "c1",
      state: "output-available",
      input: { account: "Acme Outfitters" },
      output: {
        structuredContent: {
          source: "neo4j",
          paths: [
            {
              nodes: [
                { id: "p1", label: "Persona", name: "Acme Outfitters · Champion" },
                { id: "a1", label: "ContentAsset", name: "Winter Gear Launch · Hero email" },
                { id: "c1", label: "Campaign", name: "Winter Gear Launch" },
              ],
              relationships: [
                { type: "ENGAGED_WITH ×3", from: "p1", to: "a1" },
                { type: "USES", from: "c1", to: "a1" },
              ],
            },
          ],
        },
      },
    },
    { type: "text", text: "Answer" },
  ],
} as unknown as UIMessage;

describe("graph evidence panel", () => {
  it("collects paths only from knowledge-graph tools", () => {
    expect(graphEvidence(message)).toHaveLength(1);
    expect(
      graphEvidence({ ...message, parts: [{ type: "text", text: "x" }] } as UIMessage),
    ).toEqual([]);
  });

  it("renders each path as a readable chain with direction and a text alternative", () => {
    const html = renderToStaticMarkup(<GraphEvidencePanel message={message} />);
    expect(html).toContain("Graph evidence");
    expect(html).toContain("Neo4j");
    expect(html).toContain("ENGAGED_WITH ×3</em>→");
    expect(html).toContain("←<em>USES</em>");
    expect(html).toContain(
      'aria-label="Persona Acme Outfitters · Champion links to (ENGAGED_WITH ×3) ContentAsset Winter Gear Launch · Hero email is linked from (USES) Campaign Winter Gear Launch"',
    );
  });
});
