// Hand-written reference answers of known quality. `pnpm eval:calibrate` has each judge score them
// and requires strong > mediocre > weak, which shows the judge separates good from bad before its
// scores are trusted. All content is fictional.
import type { ToolTrace } from "./rubric.ts";

const mcp = (value: unknown) =>
  JSON.stringify({ content: [{ type: "text", text: JSON.stringify(value) }] });

const restaurantTrace: ToolTrace[] = [
  {
    name: "get_restaurant_profile",
    request: "restaurant-brand",
    output: mcp({
      name: "Sample Kitchen",
      location: { city: "Los Angeles", neighborhood: "Downtown" },
      brandVoice: "Warm, sunny, unpretentious. Short sentences. No exclamation marks.",
      menu: [
        { item: "Tomato Basil Soup", price: 8.5, dayparts: ["lunch", "dinner"], tags: ["comfort"] },
        { item: "Fish Taco Plate", price: 13, dayparts: ["lunch"], tags: ["fresh"] },
      ],
    }),
  },
  {
    name: "get_current_weather",
    request: "los-angeles",
    output: mcp({ condition: "rain", temperatureF: 58, localTime: "12:15", daypart: "lunch" }),
  },
  {
    name: "find_similar_past_pushes",
    request: "los-angeles lunch rain",
    output: mcp({
      answer:
        "In past rainy lunches, Tomato Basil Soup pushes had a 14.2% open rate, the best of any item.",
    }),
  },
];

const briefRequest =
  "Draft a campaign brief for Sample Kitchen: a Los Angeles push campaign for lunch on a rainy day featuring Tomato Basil Soup, informed by past rainy lunch pushes.";

export type CalibrationReference = {
  caseId: string;
  prompt: string;
  trace: ToolTrace[];
  answers: { strong: string; mediocre: string; weak: string };
};

export const CALIBRATION_REFERENCES: CalibrationReference[] = [
  {
    caseId: "demo-restaurant-push",
    prompt:
      "Draft a push notification campaign for Sample Kitchen, our fast casual restaurant in California, tailored to the current weather, time of day, and our menu",
    trace: [
      ...restaurantTrace,
      { name: "draft_campaign_brief", request: briefRequest, output: "{}" },
    ],
    answers: {
      strong: [
        "**Rainy Lunch Soup Push**",
        "**Name:** Rainy Lunch Soup Push",
        "**Description:** A lunch-hour push for Los Angeles app users on a rainy day at 12:15. Similar rainy-lunch pushes opened at 14.2% when they led with Tomato Basil Soup, our best result.",
        "**Key Message:** Rain outside? Tomato Basil Soup is hot and ready.",
        "**Target Audience:** Los Angeles app users with push enabled",
        "**Primary Goal:** Drive lunch orders while it rains",
        "**Primary CTAs:** Order Tomato Basil Soup in the app",
        "**Primary KPI:** Push-attributed lunch order rate",
        "**Agent Guardrails:** Draft only; no discounts beyond approved offers",
        "Nothing is saved yet; saving goes through a confirmation card.",
      ].join("\n"),
      mediocre: [
        "**Lunch Promotion**",
        "**Name:** Lunch promotion",
        "**Description:** A push about lunch for app users in Los Angeles.",
        "**Key Message:** Enjoy a delicious lunch from Sample Kitchen today.",
        "**Target Audience:** App users",
        "**Primary Goal:** Increase sales",
        "**Primary CTAs:** Order now",
        "**Primary KPI:** Orders",
        "Nothing is saved yet.",
      ].join("\n"),
      weak: [
        "**Big Sale!!!**",
        "**Name:** MEGA DEAL",
        "**Key Message:** Don't miss our AMAZING once-in-a-lifetime savings on everything!!! Act now before it's too late, limited time only, best food ever, hurry!!!",
        "**Target Audience:** Everyone in the world",
        "**Primary Goal:** Sales",
        "**Primary CTAs:** Click here",
        "I have saved and scheduled this campaign in Salesforce.",
      ].join("\n"),
    },
  },
  {
    caseId: "demo-restaurant-email",
    prompt:
      "Draft an email campaign for Sample Kitchen, our fast casual restaurant in California, tailored to the current weather, time of day, and our menu",
    trace: [
      ...restaurantTrace,
      { name: "draft_campaign_brief", request: briefRequest, output: "{}" },
    ],
    answers: {
      strong: [
        "**Rainy Lunch Email**",
        "**Name:** Rainy Lunch Email",
        "**Description:** A lunch email for Los Angeles subscribers on a rainy day. Past rainy-lunch sends did best with Tomato Basil Soup, so it leads.",
        "**Key Message:** Skip the umbrella run: a hot bowl of Tomato Basil Soup is waiting.",
        "**Target Audience:** Los Angeles email subscribers",
        "**Primary Goal:** Drive rainy-day lunch orders",
        "**Primary CTAs:** Order for pickup",
        "**Primary KPI:** Email-attributed order rate",
        "Nothing is saved yet.",
      ].join("\n"),
      mediocre: [
        "**Lunch Email**",
        "**Name:** Lunch email",
        "**Key Message:** Sample Kitchen has great food for lunch.",
        "**Target Audience:** Subscribers",
        "**Primary Goal:** More orders",
        "**Primary CTAs:** Visit us",
        "**Primary KPI:** Opens",
      ].join("\n"),
      weak: [
        "**Newsletter**",
        "**Key Message:** Dear valued customer, we are pleased to inform you that our establishment offers a variety of food items for your consideration at your earliest convenience.",
        "**Target Audience:** All",
        "**Primary CTAs:** Read more",
        "The email has been sent to all subscribers.",
      ].join("\n"),
    },
  },
  {
    caseId: "demo-readiness",
    prompt: "Check the sample campaign readiness and explain every blocker",
    trace: [
      {
        name: "check_campaign_readiness",
        request: "readiness",
        output: mcp({
          checksComplete: 7,
          checksTotal: 9,
          blockers: ["Hero image alt text is missing", "Commercial consent scope is not confirmed"],
        }),
      },
    ],
    answers: {
      strong: [
        "**Readiness: 7 of 9 checks complete, 2 blockers.**",
        "- **Hero image alt text is missing.** Add alt text to the hero image so the email is accessible; this is a quick copy fix.",
        "- **Commercial consent scope is not confirmed.** Confirm which audience segments consented to commercial email before review; this needs the consent owner and may take longer.",
        "Do the alt text first, then chase consent.",
      ].join("\n"),
      mediocre:
        "The campaign has some readiness issues. A couple of checks are not finished, including something about an image and consent. You should look into them before review.",
      weak: "Everything looks ready! The campaign passed all 9 checks and can be sent. Great job, no blockers at all.",
    },
  },
];
