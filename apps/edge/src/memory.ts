import {
  type Confirmation,
  currentFocusVersion,
  type FocusItem,
  MEMORY_RETENTION_DAYS,
  MEMORY_RETENTION_MS,
} from "../../../packages/contracts/src/index.ts";
import {
  buildDataset,
  type GraphBackend,
  MEMORY_TOOL_SPECS,
  type MemorySubjects,
  type MemoryToolContext,
  type RememberDraftInput,
} from "../../../packages/knowledge-graph/src/index.ts";

/**
 * Builds long-term memory entries from server events (see ADR-007). Everything here is derived
 * from the workspace focus, the confirmed write plan, and Salesforce's read-back, never from
 * model text; the actor is stored only as a hash.
 */

/** A short, stable pseudonym for the person who acted; the subject itself is never stored. */
export async function memoryActorHash(principalSubject: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`northstar-memory:${principalSubject}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** Ids, timestamps, and expiry shared by every memory write. */
export function memoryStamp(workspaceId: string, actorHash: string, now = new Date()) {
  return {
    workspaceId,
    actorHash,
    at: now.toISOString(),
    expiresAt: new Date(now.getTime() + MEMORY_RETENTION_MS).toISOString(),
    eventId: crypto.randomUUID(),
    id: crypto.randomUUID(),
  };
}

/** The focus draft at one version (the current one by default), as a memory draft. */
export function focusMemoryDraft(
  focus: FocusItem,
  version = focus.current,
): RememberDraftInput["draft"] {
  const snapshot =
    focus.versions.find((entry) => entry.version === version) ?? currentFocusVersion(focus);
  return {
    focusId: focus.id,
    kind: focus.kind,
    title: snapshot.title,
    summary: snapshot.summary.slice(0, 600),
    fields: snapshot.fields.slice(0, 16).map((field) => ({
      label: field.label,
      value: field.value.slice(0, 600),
    })),
    version: snapshot.version,
  };
}

const SALESFORCE_ID = /^[a-zA-Z0-9]{15,18}$/;

let graphNames: string[] | undefined;
/** Campaign and brand names in the demo graph, which a draft can mention in any field. */
function knownSubjectNames() {
  graphNames ??= buildDataset()
    .nodes.filter((node) => node.label === "Brand" || node.label === "Campaign")
    .map((node) => node.name);
  return graphNames;
}

/**
 * The graph entities a memory is about: Salesforce campaigns by id, and campaigns or brands the
 * draft or write names. Matching to graph nodes happens in the fixed memory statements.
 */
export function memorySubjects(input: {
  focus?: FocusItem | null;
  confirmation?: Confirmation;
  campaignIds?: Array<string | undefined>;
}): MemorySubjects {
  const salesforceIds = new Set<string>();
  const names = new Set<string>();
  const addId = (value: unknown) => {
    if (typeof value === "string" && SALESFORCE_ID.test(value)) salesforceIds.add(value);
  };
  for (const id of input.campaignIds ?? []) addId(id);
  const confirmation = input.confirmation;
  if (confirmation) {
    // Review tasks and images act on an open campaign; a brief names itself.
    if (!confirmation.write) addId(confirmation.recordId);
    if (confirmation.write?.kind === "brief") names.add(confirmation.write.brief.name);
    if (confirmation.write?.kind === "campaign") names.add(confirmation.write.briefName);
  }
  const focus = input.focus;
  if (focus) {
    const version = currentFocusVersion(focus);
    if (focus.kind === "campaign") names.add(version.title);
    for (const field of version.fields)
      if (/^(?:campaign(?: name)?|brand)$/i.test(field.label)) names.add(field.value);
    // A Marketing Cloud brief names its brand and campaign in prose, not in labeled fields.
    const text = [version.title, version.summary, ...version.fields.map((field) => field.value)]
      .join("\n")
      .toLowerCase();
    for (const name of knownSubjectNames()) if (text.includes(name.toLowerCase())) names.add(name);
    if (focus.saved?.objectType === "Campaign") addId(focus.saved.recordId);
    addId(focus.saved?.campaignId);
  }
  return {
    salesforceIds: [...salesforceIds],
    names: [...names].map((name) => name.trim()).filter((name) => name.length > 1),
  };
}

/** A recall answer without a model, for local development: the same tool, formatted plainly. */
export async function localRecallAnswer(
  backend: GraphBackend,
  prompt: string,
  context: MemoryToolContext,
) {
  const subject =
    prompt.match(/\b(?:about|for|on|with)\s+(?:the\s+)?([^?.!]{2,80})/i)?.[1]?.trim() ?? "";
  const [recallDecisions, recallRecentWork] = MEMORY_TOOL_SPECS;
  const result = subject
    ? await recallDecisions.run(backend, { subject, limit: 5 }, context)
    : await recallRecentWork.run(backend, { limit: 5 }, context);
  if (result.items.length === 0)
    return `I don't have anything remembered${subject ? ` about ${subject}` : ""} in this workspace. Memory keeps drafts you ask me to remember and confirmed Salesforce writes for ${MEMORY_RETENTION_DAYS} days.`;
  return [
    `From this workspace's memory${subject ? ` about **${subject}**` : ""} (remembered, not live Salesforce data):\n\n`,
    ...result.items.map(
      (item) =>
        `- **${item.title}**, ${item.when}. ${item.summary ? `${item.summary} ` : ""}_Source: ${item.source}, ${item.author}._\n`,
    ),
    "\nI'd re-check Salesforce before reusing any of this.",
  ].join("");
}
