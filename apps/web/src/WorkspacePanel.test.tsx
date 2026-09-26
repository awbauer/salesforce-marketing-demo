import { emptyWorkingSet, type FocusItem, type WorkingRecord } from "@northstar/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FocusCard, recordsBySystem, WorkspacePanel } from "./WorkspacePanel";

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
    render(<WorkspacePanel workingSet={{ startedAt: null, focus: null, cards: [], records }} />);
    const items = screen.getAllByTestId("workspace-record");
    expect(within(items[0] as HTMLElement).getByRole("link").textContent).toContain(
      "Open in Salesforce",
    );
    expect(within(items[1] as HTMLElement).queryByText("Created")).not.toBeNull();
    expect(within(items[2] as HTMLElement).queryByRole("link")).toBeNull();
    expect(within(items[2] as HTMLElement).queryByText(/Get Restaurant Profile/)).not.toBeNull();
  });

  it("shows the focus draft, its versions, and what it was built from", () => {
    const version = (n: number, headline: string, note: string) => ({
      version: n,
      title: "Rainy-day comfort",
      summary: "Lunch push for Los Angeles app users.",
      fields: [
        { label: "Headline", value: headline },
        { label: "Send time", value: "11:15 a.m." },
      ],
      changeNote: note,
      basedOn: ["weather:los-angeles"],
      createdAt: new Date().toISOString(),
    });
    const focus: FocusItem = {
      id: "f1",
      kind: "push-message",
      current: 2,
      versions: [
        version(1, "Soup's on.", "First draft"),
        version(2, "Warm soup is waiting.", "Make it warmer"),
      ],
    };
    let saves = 0;
    render(
      <FocusCard
        focus={focus}
        cards={[
          {
            id: "weather:los-angeles",
            kind: "weather",
            eyebrow: "Weather",
            title: "Rain in Los Angeles",
            summary: "",
            state: "ready",
            source: {
              system: "open-meteo",
              label: "Open-Meteo · live",
              freshness: "just now",
              status: "ready",
            },
            details: [],
          },
        ]}
        action={{
          label: "Save to Salesforce as brief",
          hint: "",
          disabled: false,
          onClick: () => saves++,
        }}
      />,
    );
    const card = screen.getByTestId("workspace-focus");
    expect(within(card).getByText("Push message").textContent).toBe("Push message");
    expect(within(card).queryByText("Warm soup is waiting.")).not.toBeNull();
    expect(within(card).queryByText(/Make it warmer/)).not.toBeNull();
    expect(within(card).queryByText("Weather: Rain in Los Angeles")).not.toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Save to Salesforce as brief" }));
    expect(saves).toBe(1);
    // Earlier versions are viewable but not actionable.
    fireEvent.click(within(card).getByRole("button", { name: "v1" }));
    expect(within(card).queryByText("Soup's on.")).not.toBeNull();
    expect(within(card).queryByRole("button", { name: "Save to Salesforce as brief" })).toBeNull();
  });
});
