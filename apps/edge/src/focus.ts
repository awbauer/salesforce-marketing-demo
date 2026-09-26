import { z } from "zod";
import {
  currentFocusVersion,
  FOCUS_KIND_LABELS,
  type FocusItem,
  FocusKindSchema,
  type WorkingSet,
} from "../../../packages/contracts/src/index.ts";

/**
 * The workspace focus: the draft the chat is building. The orchestrator saves each draft the
 * model writes as structured data with every version kept, so revisions, references to the
 * draft, and confirmed saves all act on the same object. Saving changes only the workspace.
 */

export const MAX_FOCUS_VERSIONS = 20;

export const FocusInputSchema = z.object({
  kind: FocusKindSchema.describe(
    "What is being drafted: push-message, email, brief, campaign, or content",
  ),
  title: z.string().min(1).max(160).describe("Short name for the draft"),
  summary: z.string().max(600).describe("One or two sentences on what it is and why"),
  fields: z
    .array(
      z.object({
        label: z.string().min(1).max(60).describe("Field name, such as Headline or Send time"),
        value: z.string().min(1).max(1200).describe("Field content"),
      }),
    )
    .min(1)
    .max(16)
    .describe("The draft itself as labeled fields"),
  changeNote: z
    .string()
    .max(240)
    .describe("For a revision, what changed; for a first draft, where it came from"),
});
export type FocusInput = z.infer<typeof FocusInputSchema>;

/**
 * Saves a draft as the focus. A draft of the same kind becomes the next version; a different
 * kind starts a new focus. Up to 20 versions are kept.
 */
export function applyFocusUpdate(
  set: WorkingSet,
  input: FocusInput,
  at: Date,
  id: () => string = () => crypto.randomUUID(),
): WorkingSet {
  const basedOn = set.cards.slice(0, 6).map((card) => card.id);
  const same = set.focus && set.focus.kind === input.kind ? set.focus : null;
  const version = {
    version: same ? Math.max(...same.versions.map((entry) => entry.version)) + 1 : 1,
    title: input.title.trim(),
    summary: input.summary.trim(),
    fields: input.fields.map((field) => ({ label: field.label.trim(), value: field.value.trim() })),
    changeNote: input.changeNote.trim() || (same ? "Revised" : "First draft"),
    basedOn,
    createdAt: at.toISOString(),
  };
  const focus: FocusItem = same
    ? {
        ...same,
        current: version.version,
        versions: [...same.versions, version].slice(-MAX_FOCUS_VERSIONS),
      }
    : { id: id(), kind: input.kind, current: 1, versions: [version] };
  return { ...set, startedAt: set.startedAt ?? at.toISOString(), focus };
}

/** Prompt lines describing the focus: the draft that revisions and saves apply to. */
export function focusPrompt(focus: FocusItem | null) {
  if (!focus) return "";
  const current = currentFocusVersion(focus);
  const fields = current.fields.map((field) => `${field.label}: ${field.value}`).join(" | ");
  return `Current focus (the draft the user is working on; revisions, references to the draft, and saves apply to it): ${FOCUS_KIND_LABELS[focus.kind]} "${current.title}" (version ${current.version}). ${current.summary} Fields: ${fields}.`;
}

/** The focus as brief text for a confirmed save, within the 500-character confirmation limit. */
export function focusBriefText(focus: FocusItem) {
  const current = currentFocusVersion(focus);
  const text = [
    `${FOCUS_KIND_LABELS[focus.kind]}: ${current.title} (v${current.version})`,
    current.summary,
    ...current.fields.map((field) => `${field.label}: ${field.value}`),
  ]
    .filter(Boolean)
    .join("\n");
  return text.length > 500 ? `${text.slice(0, 499).trimEnd()}…` : text;
}

const LABEL_LINE =
  /^\s*(?:[-*•]\s*)?(?:\*\*|__)([^*_:\n]{1,60}?):?(?:\*\*|__):?\s*(.+?)\s*$|^\s*(?:[-*•]\s*)?([A-Z][\w /&'()-]{0,40}):\s+(.+?)\s*$/;
const stripMarkdown = (text: string) =>
  text
    .replace(/\*\*|__|`/g, "")
    .replace(/^#+\s*/, "")
    .trim();

/**
 * The draft in a model answer as focus input: its title (a heading or a bold first line), a
 * summary (its first plain paragraph), and its labeled lines ("**Headline:** …") as fields.
 * The orchestrator saves drafts this way, so a drafting turn never depends on the model
 * producing a large structured tool call.
 */
export function focusFromAnswer(
  answer: string,
  options: { kind: FocusInput["kind"]; fallbackTitle: string; changeNote: string },
): FocusInput | null {
  const lines = answer
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const titleLine = lines.find(
    (line) => /^#{1,4}\s+\S/.test(line) || /^(\*\*|__)[^*_]+\1$/.test(line),
  );
  const title = titleLine ? stripMarkdown(titleLine).replace(/[.:]+$/, "") : options.fallbackTitle;
  const fields: FocusInput["fields"] = [];
  const seen = new Map<string, number>();
  const prose: string[] = [];
  for (const line of lines) {
    if (line === titleLine) continue;
    const match = LABEL_LINE.exec(line);
    const label = match ? stripMarkdown(match[1] ?? match[3] ?? "") : "";
    const value = match ? stripMarkdown(match[2] ?? match[4] ?? "") : "";
    if (label && value && fields.length < 16) {
      const count = (seen.get(label.toLowerCase()) ?? 0) + 1;
      seen.set(label.toLowerCase(), count);
      fields.push({
        label: (count > 1 ? `${label} ${count}` : label).slice(0, 60),
        value: value.slice(0, 1200),
      });
    } else if (!/^[-*•|#]/.test(line) && !/^\d+[.)]/.test(line)) prose.push(stripMarkdown(line));
  }
  if (!fields.length) {
    const body = lines
      .filter((line) => line !== titleLine)
      .map(stripMarkdown)
      .join("\n")
      .slice(0, 1200);
    if (!body) return null;
    fields.push({ label: "Draft", value: body });
  }
  return {
    kind: options.kind,
    title: title.slice(0, 160) || options.fallbackTitle,
    summary: (prose[0] ?? "").slice(0, 600),
    fields,
    changeNote: options.changeNote.slice(0, 240),
  };
}
