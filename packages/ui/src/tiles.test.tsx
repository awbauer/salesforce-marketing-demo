import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initialOrchestratorState } from "@northstar/contracts";
import {
  InsightBoard,
  normalizeAssistantText,
  resolveTileRenderMode,
  salesforceRecordUrl,
  shouldShowChatError,
  toolFreeTraceDetail,
} from "./index";

afterEach(cleanup);

describe("InsightBoard", () => {
  it("renders model formatting as safe readable plain text", () => {
    expect(
      normalizeAssistantText(
        "**Campaign readiness** || **Brief** | Audience<br>Channel || |---|---|",
      ),
    ).toBe("Campaign readiness\nBrief · Audience\nChannel");
    expect(
      normalizeAssistantText(
        JSON.stringify({ message: "Campaign overview\n- Engagement is holding steady" }),
      ),
    ).toBe("Campaign overview\n- Engagement is holding steady");
    expect(normalizeAssistantText('{"message":"Campaign overview\\n- Evidence pending')).toBe(
      "Campaign overview\n- Evidence pending",
    );
  });

  it("does not pair a completed answer with a contradictory interruption error", () => {
    expect(
      shouldShowChatError(true, [
        { role: "user", text: "Summarize the campaign" },
        {
          role: "assistant",
          text: JSON.stringify({ message: "A complete Salesforce-grounded response." }),
        },
      ]),
    ).toBe(false);
    expect(
      shouldShowChatError(true, [
        { role: "user", text: "Create a brief" },
        { role: "assistant", text: "", hasCompletedToolOutput: true },
        { role: "assistant", text: "" },
      ]),
    ).toBe(false);
    expect(
      shouldShowChatError(true, [
        { role: "user", text: "Create a brief" },
        { role: "assistant", text: "" },
      ]),
    ).toBe(true);
    expect(shouldShowChatError(false, [{ role: "assistant", text: "Complete" }])).toBe(false);
  });

  it("does not describe a missing Salesforce catalog as an intentional tool-free answer", () => {
    expect(
      toolFreeTraceDetail(
        "Salesforce is connected, but the governed tool catalog is not ready for this request.",
      ),
    ).toContain("No Salesforce tool completed");
    expect(toolFreeTraceDetail("Here is how the proof works.")).toContain(
      "no Salesforce action was needed",
    );
  });

  it("renders typed source and freshness evidence", () => {
    render(<InsightBoard tiles={initialOrchestratorState.tiles} />);
    expect(screen.getByText("Campaign · sample data")).toBeInTheDocument();
    expect(screen.getByText("Needs refresh")).toBeInTheDocument();
    expect(screen.getByText("Native fallback")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Open in Salesforce/ })[0]).toHaveAttribute(
      "href",
      "https://pu1788182184076.my.salesforce.com/lightning/r/Campaign/701jV000004GglIQAS/view",
    );
  });
  it("selects HXL only when the deployed resource is available", () => {
    const readiness = initialOrchestratorState.tiles.find((tile) => tile.kind === "readiness");
    if (!readiness?.presentation) throw new Error("Expected the readiness presentation contract.");
    expect(resolveTileRenderMode(readiness)).toBe("native");
    expect(resolveTileRenderMode(readiness, [readiness.presentation.resourceUri])).toBe("hxl");
  });
  it("builds an encoded Salesforce sandbox record link", () => {
    expect(salesforceRecordUrl("Campaign Member", "record/id")).toBe(
      "https://pu1788182184076.my.salesforce.com/lightning/r/Campaign%20Member/record%2Fid/view",
    );
  });
  it("renders the empty recovery state", () => {
    render(<InsightBoard tiles={[]} />);
    expect(screen.getByText("No insights yet")).toBeInTheDocument();
  });
  it.each(["loading", "error", "stale", "permission-denied"] as const)(
    "renders the %s state without a one-off card schema",
    (state) => {
      const base = initialOrchestratorState.tiles[0];
      if (!base) throw new Error("Expected the campaign brief fixture.");
      const tile = { ...base, id: state, state };
      render(<InsightBoard tiles={[tile]} />);
      expect(screen.getByTestId("tile-campaign-brief")).toHaveClass(`state-${state}`);
    },
  );
});
