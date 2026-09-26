import { type ToolSet, tool } from "ai";
import { z } from "zod";
import {
  currentFocusVersion,
  FOCUS_KIND_LABELS,
  type FocusItem,
  FocusKindSchema,
  type WorkingSet,
} from "../../../packages/contracts/src/index.ts";

/**
 * The workspace focus: the draft the chat is building. The model saves drafts through the
 * local `update_focus` tool, so the focus is structured data with every version kept, and
 * revisions, references to the draft, and confirmed saves all act on the same object. The tool
 * changes only the workspace.
 */

export const FOCUS_TOOL_KEY = "workspace_update_focus";
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

/** The local tool the model uses to save or revise the focus. */
export function focusTools(onUpdate: (input: FocusInput) => FocusItem): ToolSet {
  return {
    [FOCUS_TOOL_KEY]: tool({
      description:
        "Save the draft you are writing (a push message, email, brief, campaign, or content) as the workspace focus, or save a revision of it as a new version. Use labeled fields for the draft itself. This only updates the workspace draft; it never saves to Salesforce, schedules, or sends anything.",
      inputSchema: FocusInputSchema,
      execute: async (input) => {
        const focus = onUpdate(input);
        const current = currentFocusVersion(focus);
        return {
          saved: true,
          focus: { kind: focus.kind, title: current.title, version: current.version },
          message: `Saved "${current.title}" as version ${current.version} of the workspace focus. It is a draft; nothing was saved to Salesforce, scheduled, or sent.`,
        };
      },
    }),
  };
}
