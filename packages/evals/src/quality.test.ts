import { describe, expect, it } from "vitest";
import { bootstrapMean, dimensionMeans, judgeAgreement, qualityIndex, topTwoBox } from "./quality";

describe("quality scoring", () => {
  it("averages each dimension across the judges that scored it", () => {
    expect(
      dimensionMeans([{ scores: { engagement: 5, clarity: 3 } }, { scores: { engagement: 3 } }]),
    ).toEqual({ engagement: 4, clarity: 3 });
  });

  it("maps 1 to 0 and 5 to 100, weighting dimensions", () => {
    expect(qualityIndex({ engagement: 5, accuracy: 5 }, { engagement: 1, accuracy: 1 })).toBe(100);
    expect(qualityIndex({ engagement: 1, accuracy: 1 }, { engagement: 1, accuracy: 1 })).toBe(0);
    // Engagement (5 -> 100) counts three times accuracy (1 -> 0): 300 / 4 = 75.
    expect(qualityIndex({ engagement: 5, accuracy: 1 }, { engagement: 3, accuracy: 1 })).toBe(75);
  });

  it("ignores weighted dimensions the judge did not score", () => {
    expect(qualityIndex({ accuracy: 5 }, { accuracy: 1, engagement: 5 })).toBe(100);
  });

  it("gives a reproducible bootstrap interval that contains the mean", () => {
    const values = [40, 55, 60, 62, 70, 75, 80, 90];
    const first = bootstrapMean(values, "model|scenario");
    expect(bootstrapMean(values, "model|scenario")).toEqual(first);
    expect(first.ciLow).toBeLessThanOrEqual(first.mean);
    expect(first.ciHigh).toBeGreaterThanOrEqual(first.mean);
    expect(first.ciHigh - first.ciLow).toBeGreaterThan(0);
    expect(first.n).toBe(8);
  });

  it("collapses the interval for a single value", () => {
    expect(bootstrapMean([70], "x")).toEqual({ mean: 70, ciLow: 70, ciHigh: 70, n: 1 });
  });

  it("computes the share of top-2-box intent ratings", () => {
    expect(topTwoBox([5, 4, 3, 2, 1])).toBeCloseTo(0.4);
    expect(topTwoBox([])).toBe(0);
  });

  it("measures agreement and flags large disagreements", () => {
    const agreement = judgeAgreement([
      [{ scores: { engagement: 4, clarity: 4 } }, { scores: { engagement: 5, clarity: 4 } }],
      [{ scores: { engagement: 1 } }, { scores: { engagement: 4 } }],
      [{ scores: { engagement: 3 } }],
    ]);
    expect(agreement).toMatchObject({
      comparisons: 3,
      withinOne: 2,
      disagreements: 1,
      turnsCompared: 2,
    });
    expect(agreement.meanAbsDiff).toBeCloseTo(4 / 3);
  });
});
