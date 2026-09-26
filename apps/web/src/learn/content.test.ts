import { describe, expect, it } from "vitest";
import { GLOSSARY, LEARN_PARTS } from "./content";

describe("learn page content", () => {
  const sections = LEARN_PARTS.flatMap((part) => part.sections);

  it("covers the context primer, the GraphRAG primer, and every demo concept", () => {
    expect(LEARN_PARTS.map((part) => part.id)).toEqual(["context", "graphrag", "concepts"]);
    for (const id of [
      "orchestrator",
      "model",
      "mcp",
      "salesforce",
      "routing",
      "reliability",
      "governance",
      "ui",
      "observability",
      "evaluations",
      "images",
      "campaign-context",
    ])
      expect(
        sections.some((section) => section.id === id),
        id,
      ).toBe(true);
  });

  it("uses unique anchors and links every section to https resources", () => {
    const ids = [
      ...LEARN_PARTS.map((part) => part.id),
      ...sections.map((section) => section.id),
      "glossary",
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of sections) {
      expect(section.resources.length, section.id).toBeGreaterThan(0);
      for (const resource of section.resources)
        expect(resource.url, resource.label).toMatch(/^https:\/\//);
    }
  });

  it("keeps the glossary sorted for scanning", () => {
    const terms = GLOSSARY.map((entry) => entry.term);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)));
  });
});
