import { describe, expect, it } from "vitest";
import { PACKS } from "../../../../packages/industry-packs/src/index";
import { ALL_USE_CASES } from "./catalog";

describe("pack use cases", () => {
  it("only name scenarios that exist in the catalog", () => {
    const ids = new Set(ALL_USE_CASES.map((useCase) => useCase.id));
    for (const pack of Object.values(PACKS))
      for (const id of pack.useCases) expect(ids.has(id), `${pack.id}: ${id}`).toBe(true);
  });
});
