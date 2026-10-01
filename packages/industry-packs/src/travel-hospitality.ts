import type { IndustryPack } from "../../contracts/src/pack.ts";
import { CORE_USE_CASES } from "./retail.ts";

export const travelHospitality: IndustryPack = {
  id: "travel-hospitality",
  label: "Travel and hospitality",
  tier: "core",
  summary: "Seasonal demand, loyalty and partner campaigns for hotels, airlines or tour operators.",
  modules: { restaurant: false, wealth: false },
  vocabulary: {
    accounts: [
      { name: "Coral Bay Resorts", country: "US", countryName: "United States" },
      { name: "Alpenglow Lodges", country: "DE", countryName: "Germany" },
      { name: "Skyline Regional Airways", country: "CA", countryName: "Canada" },
      { name: "Harbour Lights Cruises", country: "GB", countryName: "United Kingdom" },
      { name: "Outback Discovery Tours", country: "AU", countryName: "Australia" },
      { name: "Fjordline Expeditions", country: "NO", countryName: "Norway" },
      { name: "Canal City Hotels", country: "NL", countryName: "Netherlands" },
      { name: "Desert Rose Retreats", country: "US", countryName: "United States" },
      { name: "Pacific Rim Rail", country: "US", countryName: "United States" },
      { name: "Maple Ridge Ski Club", country: "CA", countryName: "Canada" },
      { name: "Old Town Boutique Stays", country: "GB", countryName: "United Kingdom" },
      { name: "Summit Air Charters", country: "US", countryName: "United States" },
    ],
    campaigns: [
      { id: "camp-fall", name: "Loyalty Status Match", status: "Active", channels: ["email"] },
      {
        id: "camp-winter",
        name: "Winter Escape Offers",
        status: "Active",
        channels: ["email", "mobile-app"],
      },
      {
        id: "camp-spring",
        name: "Spring Break Early Access",
        status: "Planned",
        channels: ["email"],
      },
      {
        id: "camp-holiday",
        name: "Holiday Travel Planner",
        status: "Planned",
        channels: ["email", "sms"],
      },
      {
        id: "camp-summer",
        name: "Last-Minute Summer Deals",
        status: "Completed",
        channels: ["mobile-app"],
      },
    ],
    contentKinds: ["Offer email", "Destination landing page", "Partner webinar invite"],
    brandRules: [
      "Accessible alt text",
      "Inspiring, plain tone",
      "No unapproved price claims",
      "Consent language present",
      "At most one emoji",
      "Fare and fee disclosure",
    ],
  },
  useCases: CORE_USE_CASES,
  promptContext:
    "The client sells travel. Demand is seasonal and price-sensitive, loyalty status matters, and every price claim needs its fare and fee disclosure.",
  sample: {
    brandVoice:
      "Inspiring but honest. Paint the trip in a sentence, then state the price and conditions plainly.",
    customerSegments: ["Loyalty members", "Lapsed travelers", "Corporate travel buyers"],
    products: ["Hotel stays", "Flights", "Packages"],
    compliance: ["Fare and fee disclosure", "Consent per channel"],
  },
};
