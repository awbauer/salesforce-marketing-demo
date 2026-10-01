import type { IndustryPack } from "../../contracts/src/pack.ts";
import { CORE_USE_CASES } from "./retail.ts";

export const healthcarePayer: IndustryPack = {
  id: "healthcare-payer",
  label: "Healthcare payers and providers",
  tier: "core",
  summary:
    "Member engagement, enrollment periods and care-gap outreach with healthcare-specific content rules.",
  modules: { restaurant: false, wealth: false },
  vocabulary: {
    accounts: [
      { name: "Riverside Employer Health Plans", country: "US", countryName: "United States" },
      { name: "Summit Regional Hospital Network", country: "US", countryName: "United States" },
      { name: "Lakeshore Physician Group", country: "US", countryName: "United States" },
      { name: "Maple Leaf Benefits", country: "CA", countryName: "Canada" },
      { name: "Cobalt Pharmacy Partners", country: "US", countryName: "United States" },
      { name: "Northern Care Collective", country: "GB", countryName: "United Kingdom" },
      { name: "Evergreen Senior Living", country: "US", countryName: "United States" },
      { name: "Harbor Health Brokers", country: "US", countryName: "United States" },
      { name: "Alpine Dental Alliance", country: "DE", countryName: "Germany" },
      { name: "Clearwater Behavioral Health", country: "US", countryName: "United States" },
      { name: "Southern Cross Clinics", country: "AU", countryName: "Australia" },
      { name: "Tulip Wellness Cooperative", country: "NL", countryName: "Netherlands" },
    ],
    campaigns: [
      {
        id: "camp-fall",
        name: "Annual Enrollment Reminders",
        status: "Active",
        channels: ["email"],
      },
      {
        id: "camp-winter",
        name: "Flu Season Prevention",
        status: "Active",
        channels: ["email", "mobile-app"],
      },
      {
        id: "camp-spring",
        name: "Preventive Screening Drive",
        status: "Planned",
        channels: ["email"],
      },
      {
        id: "camp-holiday",
        name: "Benefits Renewal Notices",
        status: "Planned",
        channels: ["email", "sms"],
      },
      {
        id: "camp-summer",
        name: "Wellness Challenge",
        status: "Completed",
        channels: ["mobile-app"],
      },
    ],
    contentKinds: ["Member email", "Plan landing page", "Provider webinar invite"],
    brandRules: [
      "Accessible alt text",
      "Plain-language tone",
      "No unapproved health claims",
      "Consent language present",
      "No individual health information",
      "Legal and regulatory footer",
    ],
  },
  useCases: CORE_USE_CASES,
  promptContext:
    "The client is a health plan. Member communications follow plain-language and privacy rules, avoid individual health details, and peak around enrollment periods.",
  sample: {
    brandVoice:
      "Clear, caring, and plain-language. Explain benefits simply and never imply a diagnosis.",
    customerSegments: ["Plan members", "Employer groups", "Provider partners"],
    products: ["Medical plans", "Dental plans", "Wellness programs"],
    compliance: [
      "HIPAA-aware messaging",
      "No individual health information",
      "Plain-language reading level",
    ],
  },
};
