import type { Confirmation } from "@northstar/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PermissionDetails, RecordWriteDetails } from "./ConfirmationDetails";

const confirmation = (overrides: Partial<Confirmation> = {}): Confirmation => ({
  id: "0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  action: "save-message",
  recordId: "new",
  principalSubject: "local-evaluator",
  requestHash: "b".repeat(64),
  idempotencyKey: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
  summary: "Create the push message.",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  status: "pending",
  write: {
    objectType: "Northstar_Message__c",
    objectLabel: "Message",
    newCampaignName: "Coastline Weather Moments",
    brand: "Coastline Kitchen",
    title: "Rainy-day comfort",
    channel: "Push",
    subject: "Soup's on.",
    body: "Warm up with soup.",
    draftFields: "[]",
  },
  permissions: {
    source: "salesforce",
    user: "Avery Evaluator",
    allowed: true,
    checkedAt: new Date().toISOString(),
    checks: [
      { label: "Create Northstar Message", passed: true, detail: "Allowed." },
      { label: "Marketing User", passed: true, detail: "Can create campaigns." },
    ],
  },
  ...overrides,
});

describe("confirmation details", () => {
  it("states the record to be written, including a new campaign", () => {
    const html = renderToStaticMarkup(<RecordWriteDetails confirmation={confirmation()} />);
    expect(html).toContain("Create message “Rainy-day comfort”");
    expect(html).toContain("new campaign</strong> “Coastline Weather Moments” (Coastline Kitchen)");
    expect(html).toContain("Soup&#x27;s on.");
    expect(
      renderToStaticMarkup(
        <RecordWriteDetails confirmation={confirmation({ write: undefined })} />,
      ),
    ).toBe("");
  });

  it("lists each Salesforce permission check and who checks what", () => {
    const html = renderToStaticMarkup(<PermissionDetails confirmation={confirmation()} />);
    expect(html).toContain("as Avery Evaluator");
    expect(html).toContain("Create Northstar Message");
    expect(html).toContain("Marketing User");
    expect(html).toContain("Owns authorization");
    expect(html).toContain("It has no write tools");
  });
});
