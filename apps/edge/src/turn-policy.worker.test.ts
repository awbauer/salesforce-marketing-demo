import { referentFromReply } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { isFollowUpReference, orchestratorSystemPrompt } from "./turn-policy";

const REFERENCES = [{ kind: "campaign-brief", title: "Fall loyalty reactivation" }];

describe("follow-up references", () => {
  it("recognizes short messages that point back at the previous reply", () => {
    expect(isFollowUpReference("looks good, create this brief")).toBe(true);
    expect(isFollowUpReference("send it for review")).toBe(true);
    expect(isFollowUpReference("Draft a campaign brief for the fall loyalty launch")).toBe(false);
    expect(
      isFollowUpReference(
        "Draft a push notification campaign for Coastline Kitchen that uses this week's weather, time of day, and menu favorites",
      ),
    ).toBe(false);
  });

  it("anchors the follow-up to the previous reply, not a workspace record", () => {
    const referent = referentFromReply(
      "**Draft Push-Notification Campaign – Coastline Kitchen**\n\n| Feature | Detail |",
    );
    const prompt = orchestratorSystemPrompt(REFERENCES, undefined, { referent });
    expect(prompt).toContain(
      'refers to your previous reply, "Draft Push-Notification Campaign – Coastline Kitchen"',
    );
    expect(prompt).toContain("Do not substitute a workspace record reference");
    expect(prompt).toMatch(/Background workspace record references .*never what "this"/);
  });

  it("adds no follow-up guidance to a fresh request", () => {
    expect(orchestratorSystemPrompt(REFERENCES)).not.toContain("refers to your previous reply");
  });
});
