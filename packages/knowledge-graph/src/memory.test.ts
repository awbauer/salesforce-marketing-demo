import { describe, expect, it } from "vitest";
import { buildDataset } from "./dataset";
import {
  createMemoryStore,
  FIND_DRAFT_CYPHER,
  FORGET_MEMORY_CYPHER,
  forgetMemory,
  LIST_MEMORY_CYPHER,
  listMemory,
  MEMORY_DATASET,
  MEMORY_TOOL_SPECS,
  PRUNE_RECORD_REFS_CYPHER,
  RECORD_DECISION_CYPHER,
  REMEMBER_DRAFT_CYPHER,
  recordDecision,
  rememberDraft,
  SWEEP_MEMORY_CYPHER,
  sweepMemory,
} from "./memory";
import type { GraphBackend, Row } from "./tools";

const dataset = buildDataset();
const now = new Date("2026-09-26T18:00:00Z");
const fixture = (): GraphBackend => ({ kind: "fixture", dataset, memory: createMemoryStore() });

let sequence = 0;
const stamp = (workspaceId: string, minutesAgo: number, days = 14) => {
  const at = new Date(now.getTime() - minutesAgo * 60_000);
  sequence += 1;
  return {
    workspaceId,
    actorHash: "a1b2c3d4e5f60718",
    at: at.toISOString(),
    expiresAt: new Date(at.getTime() + days * 86_400_000).toISOString(),
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    id: `10000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  };
};
const subjects = { salesforceIds: [], names: ["Coastline Kitchen"] };
const draft = (version: number, headline: string) => ({
  focusId: "focus-1",
  kind: "push-message",
  title: "Rainy-day comfort",
  summary: `Version ${version}`,
  fields: [{ label: "Headline", value: headline }],
  version,
});
const tool = (name: string) => {
  const spec = MEMORY_TOOL_SPECS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(name);
  return spec;
};

async function seeded(workspaceId = "workspace-a") {
  const backend = fixture();
  const first = await rememberDraft(backend, {
    ...stamp(workspaceId, 30),
    source: "remembered",
    draft: draft(1, "Soup's on"),
    subjects,
  });
  const second = await rememberDraft(backend, {
    ...stamp(workspaceId, 20),
    source: "saved-to-salesforce",
    draft: draft(2, "Rain check: soup's on"),
    subjects,
  });
  const decision = await recordDecision(backend, {
    ...stamp(workspaceId, 10),
    decision: { kind: "confirmed-write", outcome: "Saved the brief.", note: "From version 2." },
    record: {
      system: "salesforce",
      objectType: "Brief",
      recordId: "21y000000000001",
      title: "Rainy-day comfort",
    },
    draftRef: { focusId: "focus-1", version: 2 },
    subjects,
  });
  return { backend, first, second, decision };
}

describe("long-term memory", () => {
  it("links drafts by version, decisions to the draft and record, and both to graph subjects", async () => {
    const { backend, first, second, decision } = await seeded();
    const items = await listMemory(backend, "workspace-a", now);
    expect(items.map((item) => item.id)).toEqual([decision.id, second.id, first.id]);
    const [saved, v2, v1] = items;
    expect(saved).toMatchObject({
      type: "Decision",
      title: "Saved to Salesforce: Rainy-day comfort",
      source: "Confirmed Salesforce write, read back",
      author: "teammate a1b2c3",
      draft: { id: second.id, version: 2 },
      records: [{ objectType: "Brief", recordId: "21y000000000001" }],
    });
    expect(v2?.supersedes).toMatchObject({ id: first.id, version: 1 });
    expect(v1?.supersedes).toBeUndefined();
    expect(saved?.about.map((node) => node.label)).toEqual(["Brand"]);
  });

  it("remembers a draft version once", async () => {
    const { backend, second } = await seeded();
    const again = await rememberDraft(backend, {
      ...stamp("workspace-a", 5),
      source: "remembered",
      draft: draft(2, "Rain check: soup's on"),
      subjects,
    });
    expect(again).toEqual({ id: second.id, created: false });
  });

  it("keeps each workspace's memory to itself, in reads, recall, and forget", async () => {
    const { backend, decision } = await seeded("workspace-a");
    const context = { workspaceId: "workspace-b", now: () => now };
    expect(await listMemory(backend, "workspace-b", now)).toEqual([]);
    const recalled = await tool("recall_decisions").run(
      backend,
      { subject: "coastline", limit: 5 },
      context,
    );
    expect(recalled.count).toBe(0);
    const explained = await tool("explain_memory").run(backend, { memoryId: decision.id }, context);
    expect(explained.found).toBe(false);
    expect(await forgetMemory(backend, "workspace-b", decision.id)).toBe(false);
    expect(await listMemory(backend, "workspace-a", now)).toHaveLength(3);
  });

  it("recalls dated, sourced items with provenance paths, and explains the draft history", async () => {
    const { backend, decision, first, second } = await seeded();
    const context = { workspaceId: "workspace-a", now: () => now };
    const recalled = await tool("recall_decisions").run(
      backend,
      { subject: "21y000000000001", limit: 5 },
      context,
    );
    expect(recalled.items).toHaveLength(1);
    expect(recalled.items[0]).toMatchObject({
      when: "2026-09-26 17:50 UTC (less than a day ago)",
      source: "Confirmed Salesforce write, read back",
      records: ["Brief Rainy-day comfort (21y000000000001)"],
    });
    expect(recalled.note).toMatch(/re-check Salesforce/);
    expect(recalled.paths.map((path) => path.relationships[0]?.type)).toEqual([
      "RECORDED_IN",
      "DECIDED_ON",
      "ABOUT",
    ]);
    const explained = await tool("explain_memory").run(backend, { memoryId: decision.id }, context);
    expect(explained.history?.map((item) => item.id)).toEqual([second.id, first.id]);
    const recent = await tool("recall_recent_work").run(backend, { limit: 2 }, context);
    expect(recent.items.map((item) => item.id)).toEqual([decision.id, second.id]);
  });

  it("forgets one memory and sweeps expired ones", async () => {
    const { backend, first } = await seeded();
    expect(await forgetMemory(backend, "workspace-a", first.id)).toBe(true);
    expect(await listMemory(backend, "workspace-a", now)).toHaveLength(2);
    await rememberDraft(backend, {
      ...stamp("workspace-a", 60 * 24 * 20, 14),
      source: "remembered",
      draft: { ...draft(1, "Old"), focusId: "focus-old" },
      subjects,
    });
    // Expired items are hidden from reads before the sweep removes them.
    expect(await listMemory(backend, "workspace-a", now)).toHaveLength(2);
    expect(await sweepMemory(backend, now)).toBe(1);
  });

  it("writes Neo4j memory only through fixed, parameterized statements in its own dataset", async () => {
    const calls: Array<{ mode: string; statement: string; parameters: Row }> = [];
    const backend: GraphBackend = {
      kind: "neo4j",
      query: async (statement, parameters) => {
        calls.push({ mode: "read", statement, parameters });
        return [];
      },
      write: async (statement, parameters) => {
        calls.push({ mode: "write", statement, parameters });
        return [{ deleted: 1 }];
      },
    };
    await rememberDraft(backend, {
      ...stamp("workspace-a", 1),
      source: "remembered",
      draft: draft(1, "Soup"),
      subjects,
    });
    await recordDecision(backend, {
      ...stamp("workspace-a", 1),
      decision: { kind: "review", outcome: "Review requested.", note: "" },
      record: { system: "salesforce", objectType: "Task", recordId: "00T1", title: "Review" },
      subjects,
    });
    await listMemory(backend, "workspace-a", now);
    await forgetMemory(backend, "workspace-a", "10000000-0000-4000-8000-000000000001");
    await sweepMemory(backend, now);
    const fixed = new Set([
      FIND_DRAFT_CYPHER,
      PRUNE_RECORD_REFS_CYPHER,
      REMEMBER_DRAFT_CYPHER,
      RECORD_DECISION_CYPHER,
      LIST_MEMORY_CYPHER,
      FORGET_MEMORY_CYPHER,
      SWEEP_MEMORY_CYPHER,
    ]);
    const writes = calls.filter((call) => call.mode === "write");
    expect(writes.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call.parameters.dataset).toBe(MEMORY_DATASET);
      expect(fixed.has(call.statement), call.statement.slice(0, 60)).toBe(true);
    }
    expect(
      calls.find((call) => call.statement === REMEMBER_DRAFT_CYPHER)?.parameters,
    ).toMatchObject({
      workspaceId: "workspace-a",
      names: ["coastline kitchen"],
      fields: expect.any(String),
    });
  });
});
