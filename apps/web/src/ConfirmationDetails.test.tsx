import type { Confirmation } from "@northstar/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketingWriteDetails, PermissionDetails } from "./ConfirmationDetails";

const confirmation = (overrides: Partial<Confirmation> = {}): Confirmation => ({
  id: "0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  action: "save-marketing-brief",
  recordId: "new",
  principalSubject: "local-evaluator",
  requestHash: "b".repeat(64),
  idempotencyKey: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
  summary: "Save the brief.",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  status: "pending",
  write: {
    kind: "brief",
    brief: {
      name: "Rainy-day comfort",
      description: "Lunch campaign for Los Angeles app users.",
      keyMessage: "Soup's on.",
      targetAudience: "Los Angeles app users",
    },
  },
  permissions: {
    source: "salesforce",
    user: "Avery Evaluator",
    allowed: true,
    checkedAt: new Date().toISOString(),
    checks: [
      { label: "Create Brief", passed: true, detail: "Allowed." },
      { label: "Create Brief Plan Step", passed: true, detail: "Allowed." },
    ],
  },
  ...overrides,
});

describe("confirmation details", () => {
  it("states the brief the Campaign Creation agent will save, and the actions it runs", () => {
    const html = renderToStaticMarkup(<MarketingWriteDetails confirmation={confirmation()} />);
    expect(html).toContain("Save the brief “Rainy-day comfort” in Marketing Cloud");
    expect(html).toContain("Soup&#x27;s on.");
    expect(html).toContain("Northstar Campaign Creation");
    expect(html).toContain("Marketing Cloud Next Campaign Creation agent");
    expect(html).toContain("MktCloud__CampaignCreationAgent");
    expect(html).toContain("Marketing Cloud: Save Campaign Brief");
    expect(html).toContain("flow://MktCloud__GenerateCampaignFromBrief");
    expect(
      renderToStaticMarkup(
        <MarketingWriteDetails confirmation={confirmation({ write: undefined })} />,
      ),
    ).toBe("");
  });

  it("states the campaign and flow the agent will create from a saved brief", () => {
    const html = renderToStaticMarkup(
      <MarketingWriteDetails
        confirmation={confirmation({
          action: "create-marketing-campaign",
          recordId: "21yjV0000002NIHQA2",
          write: {
            kind: "campaign",
            briefId: "21yjV0000002NIHQA2",
            briefName: "Rainy-day comfort",
          },
        })}
      />,
    );
    expect(html).toContain("Create the campaign and its flow");
    expect(html).toContain("/lightning/r/Brief/21yjV0000002NIHQA2/view");
    expect(html).toContain("Marketing Cloud: Create Campaign");
    expect(html).toContain("Marketing Cloud: Save Campaign");
  });

  it("lists each Salesforce permission check and who checks what", () => {
    const html = renderToStaticMarkup(<PermissionDetails confirmation={confirmation()} />);
    expect(html).toContain("as Avery Evaluator");
    expect(html).toContain("Create Brief");
    expect(html).toContain("Owns authorization");
    expect(html).toContain("It has no write tools");
    expect(html).toContain("never creates briefs or campaigns itself");
  });
});
