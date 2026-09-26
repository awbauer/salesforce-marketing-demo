import { emptyWorkingSet, type WorkingRecord } from "@northstar/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { recordsBySystem, WorkspacePanel } from "./WorkspacePanel";

afterEach(cleanup);

const record = (overrides: Partial<WorkingRecord>): WorkingRecord => ({
  system: "salesforce",
  systemLabel: "Salesforce",
  objectType: "Campaign",
  recordId: "701jV000004GglIQAS",
  key: "salesforce:Campaign:701jV000004GglIQAS",
  title: "Fall Loyalty Reactivation",
  relation: "read",
  via: "summarize_campaign",
  addedAt: new Date().toISOString(),
  ...overrides,
});

describe("workspace panel", () => {
  it("explains an empty workspace", () => {
    render(<WorkspacePanel workingSet={emptyWorkingSet()} />);
    expect(screen.getByText("Nothing in this chat yet").textContent).toBe(
      "Nothing in this chat yet",
    );
    expect(screen.queryByText(/New chat always starts with an empty workspace/)).not.toBeNull();
  });

  it("groups records by system and links only where the system has links", () => {
    const records = [
      record({}),
      record({
        system: "restaurant-data",
        systemLabel: "Restaurant data",
        objectType: "Restaurant",
        recordId: "coastline-kitchen",
        key: "restaurant-data:Restaurant:coastline-kitchen",
        title: "Coastline Kitchen",
        via: "get_restaurant_profile",
      }),
      record({
        objectType: "Task",
        recordId: "00T000000000001",
        key: "salesforce:Task:00T000000000001",
        title: "Review campaign readiness",
        relation: "created",
        via: "create_campaign_review_request",
      }),
    ];
    expect(recordsBySystem(records).map((group) => [group.label, group.records.length])).toEqual([
      ["Salesforce", 2],
      ["Restaurant data", 1],
    ]);
    render(<WorkspacePanel workingSet={{ startedAt: null, cards: [], records }} />);
    const items = screen.getAllByTestId("workspace-record");
    expect(within(items[0] as HTMLElement).getByRole("link").textContent).toContain(
      "Open in Salesforce",
    );
    expect(within(items[1] as HTMLElement).queryByText("Created")).not.toBeNull();
    expect(within(items[2] as HTMLElement).queryByRole("link")).toBeNull();
    expect(within(items[2] as HTMLElement).queryByText(/Get Restaurant Profile/)).not.toBeNull();
  });
});
