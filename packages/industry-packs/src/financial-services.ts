import type { IndustryPack } from "../../contracts/src/pack.ts";
import { CORE_USE_CASES } from "./retail.ts";

export const financialServices: IndustryPack = {
  id: "financial-services",
  label: "Financial services and wealth management",
  tier: "vertical",
  summary:
    "Pre-approved regulated content, market-news responses, embargoed announcements and account plans for a wealth manager.",
  modules: { restaurant: false, wealth: true },
  vocabulary: {
    accounts: [
      { name: "Meridian Family Office", country: "US", countryName: "United States" },
      { name: "Cedar Valley Community Foundation", country: "US", countryName: "United States" },
      { name: "Northgate Pension Trust", country: "CA", countryName: "Canada" },
      { name: "Stonebridge Endowment", country: "GB", countryName: "United Kingdom" },
      { name: "Lakeview Medical Foundation", country: "US", countryName: "United States" },
      { name: "Ashford Holdings", country: "US", countryName: "United States" },
      { name: "Kestrel Logistics Retirement Plan", country: "DE", countryName: "Germany" },
      { name: "Bayview Retirement Advisors", country: "US", countryName: "United States" },
      { name: "Harrow Education Fund", country: "AU", countryName: "Australia" },
      { name: "Oakmont Partners", country: "US", countryName: "United States" },
      { name: "Fjord Capital Trust", country: "NO", countryName: "Norway" },
      { name: "Waterline Family Trust", country: "NL", countryName: "Netherlands" },
    ],
    campaigns: [
      { id: "camp-fall", name: "Client Review Season", status: "Active", channels: ["email"] },
      {
        id: "camp-winter",
        name: "Year-End Planning Guide",
        status: "Active",
        channels: ["email", "mobile-app"],
      },
      { id: "camp-spring", name: "Spring Market Outlook", status: "Planned", channels: ["email"] },
      {
        id: "camp-holiday",
        name: "Charitable Giving Reminders",
        status: "Planned",
        channels: ["email", "sms"],
      },
      {
        id: "camp-summer",
        name: "Mid-Year Portfolio Review",
        status: "Completed",
        channels: ["mobile-app"],
      },
    ],
    contentKinds: ["Client letter", "Insights page", "Advisor webinar invite"],
    brandRules: [
      "Accessible alt text",
      "Plain-spoken tone",
      "No unapproved claims",
      "Consent language present",
      "Client name accuracy",
      "Legal footer",
    ],
  },
  useCases: [...CORE_USE_CASES, "fsi-market-news", "fsi-deal-release", "fsi-aum-plan"],
  promptContext:
    "The client is a wealth manager serving institutions and family offices. Client communications are regulated: only pre-approved content with its required disclosures may be sent, and nothing may predict markets or promise returns.",
  sample: {
    brandVoice:
      "Calm, plain-spoken, and fiduciary: explain what a change means for the client, never predict markets or promise returns.",
    customerSegments: ["Institutional clients", "Family offices", "Newsletter subscribers"],
    products: ["Managed portfolios", "Retirement plans", "Advisory services"],
    compliance: [
      "FINRA 2210 fair and balanced",
      "Required disclosures",
      "No performance guarantees",
    ],
  },
};
