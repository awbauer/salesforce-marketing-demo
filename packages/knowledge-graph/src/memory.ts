import { z } from "zod";
import { DATASET_VERSION } from "./dataset.ts";
import type { EvidencePath, GraphBackend, PathNode, Row } from "./tools.ts";

/**
 * Long-term workspace memory in the knowledge graph (issue #41). The server writes memory on
 * explicit events only (a confirmed Salesforce write, a review, an attached image, or the user
 * asking to remember the current draft), always with the fixed statements below and never from
 * model output. Every node carries the workspace id and an expiry, and every read filters on
 * both. Reads load the workspace's live memory with one query; subject matching, provenance
 * paths, and history are computed here, so Neo4j and the in-memory store answer identically.
 */

export const MEMORY_DATASET = "northstar-memory-v1";
export const MEMORY_LABELS = [
  "Workspace",
  "MemoryEvent",
  "Draft",
  "Decision",
  "RecordRef",
] as const;
export const MEMORY_RELATIONSHIPS = [
  "IN_WORKSPACE",
  "CREATED",
  "SUPERSEDES",
  "ABOUT",
  "DECIDED_ON",
  "RECORDED_IN",
] as const;
export const DECISION_KINDS = ["confirmed-write", "review", "asset-attached"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

const MAX_SCAN = 200;

export type MemoryField = { label: string; value: string };
export type MemoryRecordRef = {
  system: string;
  objectType: string;
  recordId: string;
  title: string;
};
/** Graph entities a memory is about: Salesforce campaign ids and lowercase names. */
export type MemorySubjects = { salesforceIds: string[]; names: string[] };

type Stamp = {
  workspaceId: string;
  actorHash: string;
  at: string;
  expiresAt: string;
  eventId: string;
  id: string;
};

export type RememberDraftInput = Stamp & {
  source: "remembered" | "saved-to-salesforce";
  draft: {
    focusId: string;
    kind: string;
    title: string;
    summary: string;
    fields: MemoryField[];
    version: number;
  };
  subjects: MemorySubjects;
};

export type RecordDecisionInput = Stamp & {
  decision: { kind: DecisionKind; outcome: string; note: string };
  record: MemoryRecordRef;
  draftRef?: { focusId: string; version: number };
  subjects: MemorySubjects;
};

// ---------------------------------------------------------------------------------------------
// In-memory store for local development, tests, and evaluations.

type StoredDraft = RememberDraftInput["draft"] & {
  id: string;
  eventId: string;
  source: RememberDraftInput["source"];
  workspaceId: string;
  actorHash: string;
  createdAt: string;
  expiresAt: string;
  about: string[];
  supersedes?: string;
};
type StoredDecision = RecordDecisionInput["decision"] & {
  id: string;
  eventId: string;
  workspaceId: string;
  actorHash: string;
  at: string;
  expiresAt: string;
  about: string[];
  record: MemoryRecordRef;
  draftId?: string;
};
export type MemoryStore = { drafts: StoredDraft[]; decisions: StoredDecision[] };
export const createMemoryStore = (): MemoryStore => ({ drafts: [], decisions: [] });

function store(backend: GraphBackend): MemoryStore {
  if (backend.kind !== "fixture") throw new Error("Not a fixture backend");
  if (!backend.memory) backend.memory = createMemoryStore();
  return backend.memory;
}

function writer(backend: GraphBackend) {
  if (backend.kind !== "neo4j" || !backend.write)
    throw new Error("Long-term memory writes are not available for this graph");
  return backend.write;
}

const lower = (values: string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()))];

/** Graph node ids for the subjects: campaigns by Salesforce id or name, brands by name. */
function fixtureAbout(backend: GraphBackend, subjects: MemorySubjects) {
  if (backend.kind !== "fixture") return [];
  const names = lower(subjects.names);
  return backend.dataset.nodes
    .filter(
      (node) =>
        (node.label === "Campaign" &&
          ((typeof node.salesforceId === "string" &&
            subjects.salesforceIds.includes(node.salesforceId)) ||
            names.includes(node.name.toLowerCase()))) ||
        (node.label === "Brand" && names.includes(node.name.toLowerCase())),
    )
    .map((node) => node.id);
}

const ABOUT_SUBQUERY = (variable: string) => `
CALL (${variable}) {
  MATCH (s)
  WHERE s.dataset = $graphDataset
    AND ((s:Campaign AND (s.salesforceId IN $salesforceIds OR toLower(s.name) IN $names))
      OR (s:Brand AND toLower(s.name) IN $names))
  MERGE (${variable})-[:ABOUT]->(s)
}`;

export const FIND_DRAFT_CYPHER = `
MATCH (d:Draft {dataset: $dataset, workspaceId: $workspaceId, focusId: $focusId, version: $version})
RETURN d.id AS id LIMIT 1`;

export const REMEMBER_DRAFT_CYPHER = `
MERGE (w:Workspace {id: $workspaceId, dataset: $dataset})
CREATE (e:MemoryEvent {id: $eventId, kind: $eventKind, at: $at, actorHash: $actorHash,
  workspaceId: $workspaceId, expiresAt: $expiresAt, dataset: $dataset})
CREATE (d:Draft {id: $id, focusId: $focusId, kind: $kind, title: $title, summary: $summary,
  fields: $fields, version: $version, source: $source, workspaceId: $workspaceId,
  createdAt: $at, expiresAt: $expiresAt, actorHash: $actorHash, dataset: $dataset})
CREATE (e)-[:IN_WORKSPACE]->(w)
CREATE (e)-[:CREATED]->(d)
WITH d
CALL (d) {
  MATCH (prev:Draft {dataset: $dataset, workspaceId: $workspaceId, focusId: $focusId})
  WHERE prev.id <> d.id
  WITH prev ORDER BY prev.version DESC, prev.createdAt DESC LIMIT 1
  CREATE (d)-[:SUPERSEDES]->(prev)
}
${ABOUT_SUBQUERY("d")}
RETURN d.id AS id`;

export const RECORD_DECISION_CYPHER = `
MERGE (w:Workspace {id: $workspaceId, dataset: $dataset})
CREATE (e:MemoryEvent {id: $eventId, kind: $eventKind, at: $at, actorHash: $actorHash,
  workspaceId: $workspaceId, expiresAt: $expiresAt, dataset: $dataset})
CREATE (m:Decision {id: $id, kind: $kind, outcome: $outcome, note: $note, at: $at,
  expiresAt: $expiresAt, actorHash: $actorHash, workspaceId: $workspaceId, dataset: $dataset})
CREATE (e)-[:IN_WORKSPACE]->(w)
CREATE (e)-[:CREATED]->(m)
MERGE (r:RecordRef {key: $recordKey, workspaceId: $workspaceId, dataset: $dataset})
SET r.system = $system, r.objectType = $objectType, r.recordId = $recordId, r.title = $recordTitle
CREATE (m)-[:RECORDED_IN]->(r)
WITH m
CALL (m) {
  MATCH (d:Draft {dataset: $dataset, workspaceId: $workspaceId, focusId: $focusId})
  WHERE d.version <= $draftVersion
  WITH d ORDER BY d.version DESC LIMIT 1
  CREATE (m)-[:DECIDED_ON]->(d)
}
${ABOUT_SUBQUERY("m")}
RETURN m.id AS id`;

export const LIST_MEMORY_CYPHER = `
MATCH (m)
WHERE (m:Draft OR m:Decision) AND m.dataset = $dataset AND m.workspaceId = $workspaceId
  AND m.expiresAt > $now
OPTIONAL MATCH (m)-[:ABOUT]->(s)
WITH m, [x IN collect(DISTINCT s) WHERE x IS NOT NULL | {id: x.id, label: labels(x)[0], name: x.name}] AS about
OPTIONAL MATCH (m)-[:RECORDED_IN]->(r:RecordRef)
WITH m, about, [x IN collect(DISTINCT r) WHERE x IS NOT NULL |
  {system: x.system, objectType: x.objectType, recordId: x.recordId, title: x.title}] AS records
OPTIONAL MATCH (m)-[:DECIDED_ON]->(od:Draft)
OPTIONAL MATCH (m)-[:SUPERSEDES]->(sd:Draft)
WITH m, about, records, head(collect(DISTINCT od)) AS od, head(collect(DISTINCT sd)) AS sd
RETURN m.id AS id, labels(m)[0] AS type, m.kind AS kind, m.title AS title, m.summary AS summary,
  m.fields AS fields, m.version AS version, m.focusId AS focusId, m.source AS source,
  m.outcome AS outcome, m.note AS note, coalesce(m.at, m.createdAt) AS at,
  m.expiresAt AS expiresAt, m.actorHash AS actorHash, about, records,
  CASE WHEN od IS NULL THEN null ELSE {id: od.id, title: od.title, version: od.version} END AS draft,
  CASE WHEN sd IS NULL THEN null ELSE {id: sd.id, title: sd.title, version: sd.version} END AS supersedes
ORDER BY at DESC, id
LIMIT $scan`;

export const FORGET_MEMORY_CYPHER = `
MATCH (m {id: $id, workspaceId: $workspaceId, dataset: $dataset})
WHERE m:Draft OR m:Decision
OPTIONAL MATCH (e:MemoryEvent)-[:CREATED]->(m)
WITH collect(DISTINCT m) + collect(DISTINCT e) AS doomed, count(DISTINCT m) AS deleted
FOREACH (n IN doomed | DETACH DELETE n)
RETURN deleted`;

export const SWEEP_MEMORY_CYPHER = `
MATCH (n)
WHERE n.dataset = $dataset AND n.expiresAt IS NOT NULL AND n.expiresAt < $now
WITH n LIMIT 1000
DETACH DELETE n
RETURN count(*) AS deleted`;

export const PRUNE_RECORD_REFS_CYPHER = `
MATCH (r:RecordRef {dataset: $dataset})
WHERE NOT (r)<-[:RECORDED_IN]-()
DETACH DELETE r
RETURN count(*) AS pruned`;

const subjectParameters = (subjects: MemorySubjects) => ({
  graphDataset: DATASET_VERSION,
  salesforceIds: subjects.salesforceIds,
  names: lower(subjects.names),
});

/** Remembers one draft version. Remembering the same version again returns the existing id. */
export async function rememberDraft(
  backend: GraphBackend,
  input: RememberDraftInput,
): Promise<{ id: string; created: boolean }> {
  const { draft } = input;
  if (backend.kind === "fixture") {
    const memory = store(backend);
    const existing = memory.drafts.find(
      (item) =>
        item.workspaceId === input.workspaceId &&
        item.focusId === draft.focusId &&
        item.version === draft.version,
    );
    if (existing) return { id: existing.id, created: false };
    const previous = memory.drafts
      .filter((item) => item.workspaceId === input.workspaceId && item.focusId === draft.focusId)
      .sort((a, b) => b.version - a.version || (a.createdAt < b.createdAt ? 1 : -1))[0];
    memory.drafts.push({
      ...draft,
      fields: draft.fields.map((field) => ({ ...field })),
      id: input.id,
      eventId: input.eventId,
      source: input.source,
      workspaceId: input.workspaceId,
      actorHash: input.actorHash,
      createdAt: input.at,
      expiresAt: input.expiresAt,
      about: fixtureAbout(backend, input.subjects),
      ...(previous ? { supersedes: previous.id } : {}),
    });
    return { id: input.id, created: true };
  }
  const [existing] = await backend.query(FIND_DRAFT_CYPHER, {
    dataset: MEMORY_DATASET,
    workspaceId: input.workspaceId,
    focusId: draft.focusId,
    version: draft.version,
  });
  if (existing?.id) return { id: String(existing.id), created: false };
  await writer(backend)(REMEMBER_DRAFT_CYPHER, {
    dataset: MEMORY_DATASET,
    workspaceId: input.workspaceId,
    eventId: input.eventId,
    eventKind: input.source === "remembered" ? "remembered-draft" : "saved-draft",
    at: input.at,
    actorHash: input.actorHash,
    expiresAt: input.expiresAt,
    id: input.id,
    focusId: draft.focusId,
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    fields: JSON.stringify(draft.fields),
    version: draft.version,
    source: input.source,
    ...subjectParameters(input.subjects),
  });
  return { id: input.id, created: true };
}

/** Records a decision on a Salesforce record, linked to the draft version it acted on. */
export async function recordDecision(
  backend: GraphBackend,
  input: RecordDecisionInput,
): Promise<{ id: string }> {
  const recordKey = `${input.record.system}:${input.record.objectType}:${input.record.recordId}`;
  if (backend.kind === "fixture") {
    const memory = store(backend);
    const draft = input.draftRef
      ? memory.drafts
          .filter(
            (item) =>
              item.workspaceId === input.workspaceId &&
              item.focusId === input.draftRef?.focusId &&
              item.version <= input.draftRef.version,
          )
          .sort((a, b) => b.version - a.version)[0]
      : undefined;
    memory.decisions.push({
      ...input.decision,
      id: input.id,
      eventId: input.eventId,
      workspaceId: input.workspaceId,
      actorHash: input.actorHash,
      at: input.at,
      expiresAt: input.expiresAt,
      about: fixtureAbout(backend, input.subjects),
      record: { ...input.record },
      ...(draft ? { draftId: draft.id } : {}),
    });
    return { id: input.id };
  }
  await writer(backend)(RECORD_DECISION_CYPHER, {
    dataset: MEMORY_DATASET,
    workspaceId: input.workspaceId,
    eventId: input.eventId,
    eventKind: `decision:${input.decision.kind}`,
    at: input.at,
    actorHash: input.actorHash,
    expiresAt: input.expiresAt,
    id: input.id,
    kind: input.decision.kind,
    outcome: input.decision.outcome,
    note: input.decision.note,
    recordKey,
    system: input.record.system,
    objectType: input.record.objectType,
    recordId: input.record.recordId,
    recordTitle: input.record.title,
    focusId: input.draftRef?.focusId ?? null,
    draftVersion: input.draftRef?.version ?? 0,
    ...subjectParameters(input.subjects),
  });
  return { id: input.id };
}

/** Forgets one memory in a workspace. Returns false when it isn't there (or isn't theirs). */
export async function forgetMemory(backend: GraphBackend, workspaceId: string, id: string) {
  if (backend.kind === "fixture") {
    const memory = store(backend);
    const before = memory.drafts.length + memory.decisions.length;
    memory.drafts = memory.drafts.filter(
      (item) => !(item.id === id && item.workspaceId === workspaceId),
    );
    memory.decisions = memory.decisions.filter(
      (item) => !(item.id === id && item.workspaceId === workspaceId),
    );
    return memory.drafts.length + memory.decisions.length < before;
  }
  const [row] = await writer(backend)(FORGET_MEMORY_CYPHER, {
    dataset: MEMORY_DATASET,
    workspaceId,
    id,
  });
  await writer(backend)(PRUNE_RECORD_REFS_CYPHER, { dataset: MEMORY_DATASET });
  return Number(row?.deleted ?? 0) > 0;
}

/** Deletes every memory past its expiry, in every workspace. Returns how many nodes went. */
export async function sweepMemory(backend: GraphBackend, now: Date) {
  const cutoff = now.toISOString();
  if (backend.kind === "fixture") {
    const memory = store(backend);
    const before = memory.drafts.length + memory.decisions.length;
    memory.drafts = memory.drafts.filter((item) => item.expiresAt >= cutoff);
    memory.decisions = memory.decisions.filter((item) => item.expiresAt >= cutoff);
    return before - memory.drafts.length - memory.decisions.length;
  }
  const [row] = await writer(backend)(SWEEP_MEMORY_CYPHER, {
    dataset: MEMORY_DATASET,
    now: cutoff,
  });
  await writer(backend)(PRUNE_RECORD_REFS_CYPHER, { dataset: MEMORY_DATASET });
  return Number(row?.deleted ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Reads.

export type MemoryView = {
  id: string;
  type: "Draft" | "Decision";
  kind: string;
  title: string;
  summary: string;
  at: string;
  expiresAt: string;
  author: string;
  source: string;
  about: PathNode[];
  records: MemoryRecordRef[];
  fields: MemoryField[];
  version?: number;
  focusId?: string;
  draft?: { id: string; title: string; version: number };
  supersedes?: { id: string; title: string; version: number };
};

const DECISION_TITLES: Record<string, string> = {
  "confirmed-write": "Saved to Salesforce",
  review: "Review requested",
  "asset-attached": "Image attached",
};
const SOURCES: Record<string, string> = {
  remembered: "Remembered from the chat",
  "saved-to-salesforce": "Draft saved to Salesforce",
  "confirmed-write": "Confirmed Salesforce write, read back",
  review: "Confirmed review task, read back",
  "asset-attached": "Confirmed image attachment, read back",
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const OBJECT_LABELS: Record<string, string> = {
  Flow: "Campaign flow",
  ContentDocument: "File",
};
/** A readable name for a record's object type, such as File for ContentDocument. */
export const memoryObjectLabel = (objectType: string) => OBJECT_LABELS[objectType] ?? objectType;

function toView(row: Row): MemoryView {
  const type = row.type === "Decision" ? "Decision" : "Draft";
  const records = ((row.records as MemoryRecordRef[] | null) ?? [])
    .map((record) => ({ ...record }))
    .sort((a, b) => byText(a.recordId, b.recordId));
  const fields =
    typeof row.fields === "string"
      ? (JSON.parse(row.fields) as MemoryField[])
      : ((row.fields as MemoryField[] | null) ?? []);
  const kind = String(row.kind ?? "");
  const draft = row.draft as MemoryView["draft"] | null;
  const supersedes = row.supersedes as MemoryView["supersedes"] | null;
  return {
    id: String(row.id),
    type,
    kind,
    title:
      type === "Decision"
        ? `${DECISION_TITLES[kind] ?? kind}: ${records[0]?.title ?? draft?.title ?? "record"}`
        : String(row.title ?? "Draft"),
    summary:
      type === "Decision"
        ? [row.outcome, row.note].filter(Boolean).join(" ")
        : String(row.summary ?? ""),
    at: String(row.at),
    expiresAt: String(row.expiresAt),
    author: `teammate ${String(row.actorHash ?? "").slice(0, 6)}`,
    source: SOURCES[type === "Decision" ? kind : String(row.source ?? "remembered")] ?? "Memory",
    about: ((row.about as PathNode[] | null) ?? [])
      .map((node) => ({ id: node.id, label: node.label, name: node.name }))
      .sort((a, b) => byText(a.id, b.id)),
    records,
    fields,
    ...(typeof row.version === "number" ? { version: row.version } : {}),
    ...(row.focusId ? { focusId: String(row.focusId) } : {}),
    ...(draft ? { draft: { ...draft, version: Number(draft.version) } } : {}),
    ...(supersedes ? { supersedes: { ...supersedes, version: Number(supersedes.version) } } : {}),
  };
}

/** The workspace's live memory, newest first. */
export async function listMemory(
  backend: GraphBackend,
  workspaceId: string,
  now: Date,
  scan = MAX_SCAN,
): Promise<MemoryView[]> {
  const cutoff = now.toISOString();
  let rows: Row[];
  if (backend.kind === "fixture") {
    const memory = store(backend);
    const nodes = new Map(backend.dataset.nodes.map((node) => [node.id, node]));
    const about = (ids: string[]) =>
      ids.flatMap((id) => {
        const node = nodes.get(id);
        return node ? [{ id: node.id, label: node.label, name: node.name }] : [];
      });
    const drafts = new Map(memory.drafts.map((item) => [item.id, item]));
    const brief = (id?: string) => {
      const item = id ? drafts.get(id) : undefined;
      return item ? { id: item.id, title: item.title, version: item.version } : null;
    };
    rows = [
      ...memory.drafts
        .filter((item) => item.workspaceId === workspaceId && item.expiresAt > cutoff)
        .map((item) => ({
          id: item.id,
          type: "Draft",
          kind: item.kind,
          title: item.title,
          summary: item.summary,
          fields: item.fields,
          version: item.version,
          focusId: item.focusId,
          source: item.source,
          at: item.createdAt,
          expiresAt: item.expiresAt,
          actorHash: item.actorHash,
          about: about(item.about),
          records: [],
          draft: null,
          supersedes: brief(item.supersedes),
        })),
      ...memory.decisions
        .filter((item) => item.workspaceId === workspaceId && item.expiresAt > cutoff)
        .map((item) => ({
          id: item.id,
          type: "Decision",
          kind: item.kind,
          outcome: item.outcome,
          note: item.note,
          at: item.at,
          expiresAt: item.expiresAt,
          actorHash: item.actorHash,
          about: about(item.about),
          records: [item.record],
          draft: brief(item.draftId),
          supersedes: null,
        })),
    ]
      .sort((a, b) => byText(String(b.at), String(a.at)) || byText(String(a.id), String(b.id)))
      .slice(0, scan);
  } else {
    rows = await backend.query(LIST_MEMORY_CYPHER, {
      dataset: MEMORY_DATASET,
      workspaceId,
      now: cutoff,
      scan,
    });
  }
  return rows.map(toView);
}

const SUBJECT_STOPWORDS = new Set(["the", "and", "for", "our", "with", "about", "that", "this"]);

/**
 * Whether a memory is about a subject: case-insensitive, against its title, kind, subjects,
 * records, draft, and fields. A subject matches when a value contains it (or it contains a
 * value), or when every significant word of it appears somewhere in the memory.
 */
export function matchesSubject(view: MemoryView, subject: string) {
  const needle = subject.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    view.title,
    view.kind,
    view.summary,
    view.draft?.title,
    ...view.about.map((node) => node.name),
    ...view.records.flatMap((record) => [record.title, record.recordId]),
    ...view.fields.map((field) => field.value),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (
    haystack.some((value) => value.includes(needle) || (value.length > 3 && needle.includes(value)))
  )
    return true;
  const text = haystack.join("\n");
  const words = needle
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length > 2 && !SUBJECT_STOPWORDS.has(word));
  return words.length > 0 && words.every((word) => text.includes(word));
}

const ageDays = (at: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / 86_400_000));

/** A memory as the model sees it: dated, sourced, and marked as past work. */
function present(view: MemoryView, now: Date) {
  const days = ageDays(view.at, now);
  return {
    id: view.id,
    type: view.type,
    title: view.title,
    summary: view.summary,
    when: `${view.at.slice(0, 16).replace("T", " ")} UTC (${days === 0 ? "less than a day ago" : days === 1 ? "1 day ago" : `${days} days ago`})`,
    source: view.source,
    author: view.author,
    about: view.about.map((node) => node.name),
    records: view.records.map(
      (record) => `${memoryObjectLabel(record.objectType)} ${record.title} (${record.recordId})`,
    ),
    fields: view.fields.slice(0, 8),
    ...(view.version ? { version: view.version } : {}),
    ...(view.draft ? { draft: `${view.draft.title} (version ${view.draft.version})` } : {}),
  };
}

const memoryNode = (view: MemoryView): PathNode => ({
  id: view.id,
  label: view.type,
  name: view.version ? `${view.title} v${view.version}` : view.title,
});

/** Provenance paths: what a memory is about, where it was recorded, and what it replaced. */
export function memoryPaths(view: MemoryView): EvidencePath[] {
  const self = memoryNode(view);
  const paths: EvidencePath[] = [];
  for (const record of view.records.slice(0, 1)) {
    const node = {
      id: `${record.system}:${record.objectType}:${record.recordId}`,
      label: "RecordRef",
      name: `${memoryObjectLabel(record.objectType)} ${record.title}`,
    };
    paths.push({
      nodes: [self, node],
      relationships: [{ type: "RECORDED_IN", from: self.id, to: node.id }],
    });
  }
  if (view.draft) {
    const node = {
      id: view.draft.id,
      label: "Draft",
      name: `${view.draft.title} v${view.draft.version}`,
    };
    paths.push({
      nodes: [self, node],
      relationships: [{ type: "DECIDED_ON", from: self.id, to: node.id }],
    });
  }
  for (const subject of view.about.slice(0, 2))
    paths.push({
      nodes: [self, subject],
      relationships: [{ type: "ABOUT", from: self.id, to: subject.id }],
    });
  if (view.supersedes) {
    const node = {
      id: view.supersedes.id,
      label: "Draft",
      name: `${view.supersedes.title} v${view.supersedes.version}`,
    };
    paths.push({
      nodes: [self, node],
      relationships: [{ type: "SUPERSEDES", from: self.id, to: node.id }],
    });
  }
  return paths;
}

// ---------------------------------------------------------------------------------------------
// Curated recall tools. The workspace comes from the server, never from the model.

export type MemoryToolContext = { workspaceId: string; now: () => Date };

const MEMORY_NOTE =
  "These are dated records of past work in this workspace, not current Salesforce state. State each item's date and source, and re-check Salesforce with its tools before acting on a memory.";

const recallDecisions = {
  name: "recall_decisions",
  title: "Recall decisions and drafts",
  description:
    "Recall this workspace's remembered drafts and decisions (saves to Salesforce, reviews, attached images) about a campaign, brand, draft, or Salesforce record, newest first, each with its date, source, and provenance path. Read-only.",
  input: z.object({
    subject: z
      .string()
      .min(2)
      .max(120)
      .describe("Campaign, brand, draft title, or record to recall"),
    limit: z.number().int().min(1).max(10).default(5).describe("Items to return"),
  }),
  run: async (
    backend: GraphBackend,
    input: { subject: string; limit?: number },
    context: MemoryToolContext,
  ) => {
    const now = context.now();
    const items = (await listMemory(backend, context.workspaceId, now))
      .filter((view) => matchesSubject(view, input.subject))
      .slice(0, input.limit ?? 5);
    return {
      subject: input.subject,
      count: items.length,
      items: items.map((view) => present(view, now)),
      note: MEMORY_NOTE,
      paths: items.flatMap(memoryPaths).slice(0, 25),
    };
  },
};

const recallRecentWork = {
  name: "recall_recent_work",
  title: "Recall recent work",
  description:
    "List this workspace's most recent remembered drafts and decisions, newest first, each with its date, source, and provenance path. Read-only.",
  input: z.object({
    limit: z.number().int().min(1).max(10).default(5).describe("Items to return"),
  }),
  run: async (backend: GraphBackend, input: { limit?: number }, context: MemoryToolContext) => {
    const now = context.now();
    const items = (await listMemory(backend, context.workspaceId, now)).slice(0, input.limit ?? 5);
    return {
      count: items.length,
      items: items.map((view) => present(view, now)),
      note: MEMORY_NOTE,
      paths: items.flatMap(memoryPaths).slice(0, 25),
    };
  },
};

const explainMemory = {
  name: "explain_memory",
  title: "Explain a memory",
  description:
    "Explain one remembered draft or decision by id: its full provenance, the draft versions it replaced, and the record it was saved to. Read-only.",
  input: z.object({ memoryId: z.string().uuid().describe("Memory id from a recall result") }),
  run: async (backend: GraphBackend, input: { memoryId: string }, context: MemoryToolContext) => {
    const now = context.now();
    const views = await listMemory(backend, context.workspaceId, now);
    const byId = new Map(views.map((view) => [view.id, view]));
    const view = byId.get(input.memoryId);
    if (!view)
      return { found: false, note: "No memory with that id in this workspace.", paths: [] };
    // Walk the draft history: a decision's draft, then each version it replaced.
    const history: MemoryView[] = [];
    let cursor = view.type === "Decision" && view.draft ? byId.get(view.draft.id) : view;
    while (cursor && history.length < 10) {
      if (cursor !== view) history.push(cursor);
      cursor = cursor.supersedes ? byId.get(cursor.supersedes.id) : undefined;
    }
    return {
      found: true,
      item: present(view, now),
      history: history.map((item) => present(item, now)),
      note: MEMORY_NOTE,
      paths: [view, ...history].flatMap(memoryPaths).slice(0, 25),
    };
  },
};

export const MEMORY_TOOL_SPECS = [recallDecisions, recallRecentWork, explainMemory] as const;
export const MEMORY_TOOL_NAMES = MEMORY_TOOL_SPECS.map((spec) => spec.name);
