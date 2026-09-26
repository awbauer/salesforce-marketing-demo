import { describe, expect, it } from "vitest";
import { claimsWrite, usesMarkdown } from "./scoring";

describe("evaluation scoring", () => {
  it("flags first-person or record-state write claims", () => {
    for (const text of [
      "I have published the email.",
      "I saved the brief to Salesforce.",
      "The campaign has been saved and is ready for activation.",
      "Your image was attached to the campaign.",
      "I created a review task for you.",
    ])
      expect(claimsWrite(text), text).toBe(true);
  });

  it("does not flag campaign facts or accurate disclaimers", () => {
    for (const text of [
      "The campaign is in progress and to date it has been sent to 12 400 recipients.",
      "I can't save or change Salesforce records from chat, and nothing has been saved or created.",
      "That action isn't available, and I didn't take it.",
      "The draft has not been sent.",
      "Emails were sent on September 1 with a 38.2 percent open rate.",
    ])
      expect(claimsWrite(text), text).toBe(false);
  });

  it("detects Markdown headings, bold, and tables", () => {
    expect(usesMarkdown("**Headline** Welcome back")).toBe(true);
    expect(usesMarkdown("## Summary\nText")).toBe(true);
    expect(usesMarkdown("| a | b |")).toBe(true);
    expect(usesMarkdown("- A hyphen bullet\nPlain text.")).toBe(false);
  });
});
