import { emptyWorkingSet, type WorkingSet } from "@workbench/contracts";
import { describe, expect, it } from "vitest";
import { applyFocusUpdate, type FocusInput, focusFromAnswer, focusPrompt } from "./focus";
import { workingSetPrompt } from "./working-set";

const at = new Date("2026-09-26T18:00:00Z");
const draft = (overrides: Partial<FocusInput> = {}): FocusInput => ({
  kind: "push-message",
  title: "Rainy-day comfort",
  summary: "Lunch push for Los Angeles app users.",
  fields: [
    { label: "Headline", value: "Rain outside? Soup's on." },
    { label: "Send time", value: "11:15 a.m." },
  ],
  changeNote: "First draft",
  ...overrides,
});

describe("workspace focus", () => {
  it("keeps every version of the same draft and starts over for a different kind", () => {
    const withCard: WorkingSet = {
      ...emptyWorkingSet(),
      cards: [
        {
          id: "weather:los-angeles",
          kind: "weather",
          eyebrow: "Weather",
          title: "Rain in Los Angeles",
          summary: "",
          state: "ready",
          source: { system: "open-meteo", label: "Open-Meteo", freshness: "now", status: "ready" },
          details: [],
        },
      ],
    };
    const first = applyFocusUpdate(withCard, draft(), at, () => "focus-1");
    expect(first.focus).toMatchObject({ id: "focus-1", kind: "push-message", current: 1 });
    expect(first.focus?.versions[0]?.basedOn).toEqual(["weather:los-angeles"]);
    const second = applyFocusUpdate(
      first,
      draft({
        fields: [{ label: "Headline", value: "Warm soup is waiting." }],
        changeNote: "Warmer",
      }),
      at,
    );
    expect(second.focus?.id).toBe("focus-1");
    expect(second.focus?.current).toBe(2);
    expect(second.focus?.versions.map((version) => version.changeNote)).toEqual([
      "First draft",
      "Warmer",
    ]);
    const brief = applyFocusUpdate(
      second,
      draft({ kind: "brief", title: "Q4 brief" }),
      at,
      () => "focus-2",
    );
    expect(brief.focus).toMatchObject({ id: "focus-2", kind: "brief", current: 1 });
  });

  it("describes the focus as the draft revisions and saves apply to", () => {
    const set = applyFocusUpdate(emptyWorkingSet(), draft(), at);
    expect(focusPrompt(set.focus)).toContain(
      'Current focus (the draft the user is working on; revisions, references to the draft, and saves apply to it): Push message "Rainy-day comfort" (version 1).',
    );
    expect(workingSetPrompt(set).startsWith("Current focus")).toBe(true);
    expect(focusPrompt(null)).toBe("");
  });

  it("reads a drafted answer's title, summary, and labeled lines into the focus", () => {
    const answer = [
      "**Rainy lunch at Sample Kitchen**",
      "",
      "A warm lunch email for Los Angeles subscribers, built from today's rain and past results.",
      "",
      "**Subject line:** Rain outside? Soup's on.",
      "- **Preheader:** Spicy Tortilla Soup, ready in minutes",
      "**Body:** Warm up with our best rainy-day bowl.",
      "Send time: 11:15 a.m.",
      "**Campaign:** Sample Kitchen Weather Moments",
      "**Brand:** Sample Kitchen",
      "It is a draft; nothing was scheduled or sent.",
    ].join("\n");
    const input = focusFromAnswer(answer, {
      kind: "email",
      fallbackTitle: "Email draft",
      changeNote: "First draft",
    });
    expect(input?.title).toBe("Rainy lunch at Sample Kitchen");
    expect(input?.summary).toContain("A warm lunch email");
    expect(input?.fields.map((field) => field.label)).toEqual([
      "Subject line",
      "Preheader",
      "Body",
      "Send time",
      "Campaign",
      "Brand",
    ]);
    const plain = focusFromAnswer("Here is a short draft without labels.", {
      kind: "content",
      fallbackTitle: "Content draft",
      changeNote: "First draft",
    });
    expect(plain).toMatchObject({ title: "Content draft", fields: [{ label: "Draft" }] });
    expect(focusFromAnswer("  ", { kind: "email", fallbackTitle: "x", changeNote: "" })).toBeNull();
  });
});
