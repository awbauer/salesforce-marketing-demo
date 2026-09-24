import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initialOrchestratorState } from "@northstar/contracts";
import { InsightBoard, normalizeAssistantText, resolveTileRenderMode } from "./index";

afterEach(cleanup);

describe("InsightBoard", () => {
  it("renders model formatting as safe readable plain text", () => {
    expect(
      normalizeAssistantText(
        "**Campaign readiness** || **Brief** | Audience<br>Channel || |---|---|",
      ),
    ).toBe("Campaign readiness\nBrief · Audience\nChannel");
  });

  it("renders typed source and freshness evidence", () => {
    render(<InsightBoard tiles={initialOrchestratorState.tiles} />);
    expect(screen.getByText("Campaign · sample data")).toBeInTheDocument();
    expect(screen.getByText("Needs refresh")).toBeInTheDocument();
    expect(screen.getByText("Native fallback")).toBeInTheDocument();
  });
  it("selects HXL only when the deployed resource is available", () => {
    const readiness = initialOrchestratorState.tiles.find((tile) => tile.kind === "readiness");
    if (!readiness?.presentation) throw new Error("Expected the readiness presentation contract.");
    expect(resolveTileRenderMode(readiness)).toBe("native");
    expect(resolveTileRenderMode(readiness, [readiness.presentation.resourceUri])).toBe("hxl");
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
