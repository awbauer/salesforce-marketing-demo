import type { IndustryPack } from "../../contracts/src/pack.ts";

/** Outdoor-gear retail: the base vocabulary every other pack swaps out. */
export const RETAIL_VOCABULARY: IndustryPack["vocabulary"] = {
  accounts: [
    { name: "Acme Outfitters", country: "US", countryName: "United States" },
    { name: "Summit Trail Co.", country: "CA", countryName: "Canada" },
    { name: "Redwood Rangers Club", country: "US", countryName: "United States" },
    { name: "Harbor Point Sports", country: "GB", countryName: "United Kingdom" },
    { name: "Blue Ridge Adventures", country: "US", countryName: "United States" },
    { name: "Pacific Crest Supply", country: "CA", countryName: "Canada" },
    { name: "Granite Peak Gear", country: "DE", countryName: "Germany" },
    { name: "Riverbend Outdoor", country: "US", countryName: "United States" },
    { name: "Northwind Expeditions", country: "NO", countryName: "Norway" },
    { name: "Cedar Hollow Camps", country: "US", countryName: "United States" },
    { name: "Silverline Cycling", country: "NL", countryName: "Netherlands" },
    { name: "Lakeside Paddle Co.", country: "AU", countryName: "Australia" },
  ],
  campaigns: [
    { id: "camp-fall", name: "Fall Loyalty Reactivation", status: "Active", channels: ["email"] },
    {
      id: "camp-winter",
      name: "Winter Gear Launch",
      status: "Active",
      channels: ["email", "mobile-app"],
    },
    { id: "camp-spring", name: "Spring Trail Series", status: "Planned", channels: ["email"] },
    {
      id: "camp-holiday",
      name: "Holiday Gift Guide",
      status: "Planned",
      channels: ["email", "sms"],
    },
    {
      id: "camp-summer",
      name: "Summer Hydration Push",
      status: "Completed",
      channels: ["mobile-app"],
    },
  ],
  contentKinds: ["Hero email", "Landing page", "Webinar invite"],
  brandRules: [
    "Accessible alt text",
    "Warm, plain tone",
    "No unapproved claims",
    "Consent language present",
    "At most one emoji",
    "Legal footer",
  ],
};

export const CORE_USE_CASES = [
  "campaign-performance",
  "readiness-review",
  "on-brand-copy",
  "buyer-group",
  "sales-outreach",
  "consent-coverage",
  "audience-overlap",
  "content-lineage",
  "campaign-visual",
  "memory-recall",
];

export const retail: IndustryPack = {
  id: "retail",
  label: "Retail and consumer brands",
  tier: "core",
  summary: "Loyalty, launches and seasonal campaigns for a consumer or outdoor-gear brand.",
  modules: { restaurant: false, wealth: false },
  vocabulary: RETAIL_VOCABULARY,
  useCases: CORE_USE_CASES,
  promptContext:
    "The client sells physical products to consumers and to trade accounts. Campaigns follow the retail calendar (launches, seasonal pushes, holiday), and loyalty reactivation matters most.",
  sample: {
    brandVoice: "Warm, plain-spoken, and practical. Short sentences, at most one emoji.",
    customerSegments: ["Loyalty members", "Lapsed buyers", "Trade accounts"],
    products: ["Apparel", "Equipment", "Accessories"],
    compliance: ["Marketing consent per channel", "Accessibility (WCAG) for email"],
  },
};
