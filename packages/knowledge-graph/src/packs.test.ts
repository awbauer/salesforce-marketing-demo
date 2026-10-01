import { describe, expect, it } from "vitest";
import { PackSchema } from "../../contracts/src/pack";
import { PACKS } from "../../industry-packs/src/index";
import { buildDataset } from "./dataset";

describe.each(Object.values(PACKS))("industry pack $id", (pack) => {
  it("is a valid pack", () => {
    expect(PackSchema.safeParse(pack).success).toBe(true);
  });

  const dataset = buildDataset({ pack });
  const labels = new Set(dataset.nodes.map((node) => node.label));

  it("builds a graph with unique ids and no dangling relationships", () => {
    const ids = dataset.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(ids);
    for (const relationship of dataset.relationships) {
      expect(known.has(relationship.from), `${relationship.type} from ${relationship.from}`).toBe(
        true,
      );
      expect(known.has(relationship.to), `${relationship.type} to ${relationship.to}`).toBe(true);
    }
  });

  it("carries the pack's vocabulary", () => {
    const names = new Set(dataset.nodes.map((node) => node.name));
    for (const account of pack.vocabulary.accounts) expect(names.has(account.name)).toBe(true);
    for (const campaign of pack.vocabulary.campaigns) expect(names.has(campaign.name)).toBe(true);
  });

  it("includes each vertical's data only when the pack enables it", () => {
    expect(labels.has("Menu")).toBe(pack.modules.restaurant);
    expect(labels.has("Disclosure")).toBe(pack.modules.wealth);
  });

  it("keeps the readiness demo's failing fall hero email", () => {
    const failed = dataset.relationships.filter(
      (relationship) =>
        relationship.type === "FAILED" && relationship.to === "rule-accessible-alt-text",
    );
    expect(failed.some((relationship) => relationship.from.startsWith("asset-camp-fall-"))).toBe(
      true,
    );
  });
});
