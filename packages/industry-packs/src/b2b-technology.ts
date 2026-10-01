import type { IndustryPack } from "../../contracts/src/pack.ts";
import { CORE_USE_CASES } from "./retail.ts";

export const b2bTechnology: IndustryPack = {
  id: "b2b-technology",
  label: "B2B technology and SaaS",
  tier: "core",
  summary:
    "Account-based campaigns, buying-group coverage and renewal or expansion outreach for a software company.",
  modules: { restaurant: false, wealth: false },
  vocabulary: {
    accounts: [
      { name: "Northbeam Analytics", country: "US", countryName: "United States" },
      { name: "Corvid Robotics", country: "US", countryName: "United States" },
      { name: "Fathom Logistics", country: "CA", countryName: "Canada" },
      { name: "Tailwind Payments", country: "GB", countryName: "United Kingdom" },
      { name: "Blue Yonder Media", country: "DE", countryName: "Germany" },
      { name: "Lumen Health Systems", country: "US", countryName: "United States" },
      { name: "Apex Semiconductor", country: "NL", countryName: "Netherlands" },
      { name: "Orbit Energy Grid", country: "NO", countryName: "Norway" },
      { name: "Kite Insurance Group", country: "AU", countryName: "Australia" },
      { name: "Vertex Retail Cloud", country: "US", countryName: "United States" },
      { name: "Helix Biotech Labs", country: "US", countryName: "United States" },
      { name: "Granite Public Sector", country: "CA", countryName: "Canada" },
    ],
    campaigns: [
      { id: "camp-fall", name: "Renewal Readiness Program", status: "Active", channels: ["email"] },
      {
        id: "camp-winter",
        name: "Platform Release Launch",
        status: "Active",
        channels: ["email", "mobile-app"],
      },
      {
        id: "camp-spring",
        name: "Customer Summit Invitations",
        status: "Planned",
        channels: ["email"],
      },
      {
        id: "camp-holiday",
        name: "Year-End Expansion Offers",
        status: "Planned",
        channels: ["email", "sms"],
      },
      {
        id: "camp-summer",
        name: "Developer Community Push",
        status: "Completed",
        channels: ["mobile-app"],
      },
    ],
    contentKinds: ["Launch email", "Solution landing page", "Webinar invite"],
    brandRules: [
      "Accessible alt text",
      "Confident, plain tone",
      "No unapproved product claims",
      "Consent language present",
      "At most one emoji",
      "Legal footer",
    ],
  },
  useCases: CORE_USE_CASES,
  promptContext:
    "The client sells software to business accounts. Deals involve buying groups of several roles, campaigns are account-based, and renewal and expansion timing drives outreach.",
  sample: {
    brandVoice: "Confident, concrete, and jargon-light. Lead with the customer outcome.",
    customerSegments: ["Buying groups", "Champions", "Existing customers"],
    products: ["Platform", "Analytics add-on", "Support plans"],
    compliance: ["Consent per channel", "No unapproved product claims"],
  },
};
