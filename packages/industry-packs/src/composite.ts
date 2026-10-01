import type { IndustryPack } from "../../contracts/src/pack.ts";
import { CORE_USE_CASES, RETAIL_VOCABULARY, retail } from "./retail.ts";

/** The full tour: retail plus both vertical modules, for demos that span industries. */
export const composite: IndustryPack = {
  ...retail,
  id: "composite",
  label: "Full tour (retail + restaurant + wealth management)",
  tier: "tour",
  summary:
    "Every flow the workbench supports, across a retail brand, a restaurant brand and a wealth-management brand.",
  modules: { restaurant: true, wealth: true },
  vocabulary: RETAIL_VOCABULARY,
  useCases: [
    ...CORE_USE_CASES,
    "weather-aware-campaign",
    "service-weather",
    "weather-inventory",
    "fsi-market-news",
    "fsi-deal-release",
    "fsi-aum-plan",
  ],
};
