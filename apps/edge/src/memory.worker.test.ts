import { runInDurableObject, SELF } from "cloudflare:test";
import { PROOF_DEFAULTS, type WorkingSet } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { notMemoryCases, rememberCases } from "../../../packages/evals/src/cases";
import type { FocusInput } from "./focus";
import { connectKnowledgeGraphTools, knowledgeGraphBackend } from "./knowledge-graph/server";
import { memoryActorHash, memorySubjects } from "./memory";
import { isRecallRequest, isRememberRequest, requestedToolName } from "./turn-policy";
import { agentStubFor, openCatalogCampaign } from "./worker.test-helpers";

type MemoryList = {
  enabled: boolean;
  retentionDays: number;
  items: Array<{
    id: string;
    type: string;
    title: string;
    version?: number;
    source: string;
    author: string;
    records: Array<{ recordId: string }>;
    draft?: { version: number };
  }>;
};

const draft = (title: string): FocusInput => ({
  kind: "push-message",
  title,
  summary: "Lunch push for Los Angeles app users.",
  fields: [
    { label: "Headline", value: "Rain outside? Soup's on." },
    { label: "Campaign", value: "Coastline Weather Moments" },
    { label: "Brand", value: "Coastline Kitchen" },
  ],
  changeNote: "First draft",
});

async function focusOn(title: string, subject = "local-evaluator") {
  await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
  const stub = await openCatalogCampaign(subject);
  await runInDurableObject(stub, (instance) => {
    (instance as unknown as { updateFocus: (input: FocusInput) => unknown }).updateFocus(
      draft(title),
    );
  });
}

const listMemory = async () =>
  (await (await SELF.fetch("https://example.test/agent/memory")).json()) as MemoryList;

describe("long-term memory routing", () => {
  it("recognizes remember commands and recall questions, and nothing else", () => {
    for (const prompt of rememberCases) {
      expect(isRememberRequest(prompt), prompt).toBe(true);
      expect(isRecallRequest(prompt), prompt).toBe(false);
    }
    for (const prompt of notMemoryCases) {
      expect(isRememberRequest(prompt), prompt).toBe(false);
      expect(isRecallRequest(prompt), prompt).toBe(false);
    }
    expect(requestedToolName("What did we decide about the fall email?")).toBe("recall_decisions");
    expect(requestedToolName("What have we worked on recently?")).toBe("recall_recent_work");
  });

  it("stores a hashed actor and the campaigns and brands a draft names", async () => {
    const hash = await memoryActorHash("local-evaluator");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
    expect(hash).not.toContain("local-evaluator");
    const subjects = memorySubjects({
      focus: {
        id: "focus-1",
        kind: "push-message",
        current: 1,
        versions: [{ ...draft("Rainy-day comfort"), version: 1, basedOn: [], createdAt: "" }],
      },
      campaignIds: ["701jV000004GglIQAS", undefined],
    });
    expect(subjects).toEqual({
      salesforceIds: ["701jV000004GglIQAS"],
      names: ["Coastline Weather Moments", "Coastline Kitchen"],
    });
  });
});

describe("long-term memory in the workspace", () => {
  it("remembers the focus on request, once per version", async () => {
    await focusOn("Remembered soup push");
    const remembered = await SELF.fetch("https://example.test/agent/memory/remember", {
      method: "POST",
    });
    expect(remembered.status).toBe(200);
    await expect(remembered.json()).resolves.toMatchObject({
      created: true,
      title: "Remembered soup push",
      version: 1,
    });
    const again = await SELF.fetch("https://example.test/agent/memory/remember", {
      method: "POST",
    });
    await expect(again.json()).resolves.toMatchObject({ created: false });
    const list = await listMemory();
    expect(list).toMatchObject({ enabled: true, retentionDays: 14 });
    const item = list.items.find((entry) => entry.title === "Remembered soup push");
    expect(item).toMatchObject({ type: "Draft", version: 1, source: "Remembered from the chat" });
    expect(item?.author).not.toContain("local-evaluator");
  });

  it("refuses to remember when there is no draft", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const response = await SELF.fetch("https://example.test/agent/memory/remember", {
      method: "POST",
    });
    expect(response.status).toBe(409);
  });

  it("remembers a confirmed, read-back save with the draft version it saved", async () => {
    await focusOn("Saved soup push");
    const prepared = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save-marketing-brief" }),
    });
    expect(prepared.status).toBe(201);
    const executed = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(executed.status).toBe(200);
    const { items } = await listMemory();
    const decision = items.find(
      (item) => item.type === "Decision" && item.title.includes("Saved soup push"),
    );
    expect(decision).toMatchObject({
      source: "Confirmed Salesforce write, read back",
      draft: { version: 1 },
    });
    expect(decision?.records[0]?.recordId).toMatch(/^[a-zA-Z0-9]{15,18}$/);
    expect(
      items.find((item) => item.type === "Draft" && item.title === "Saved soup push"),
    ).toMatchObject({ source: "Draft saved to Salesforce" });
  });

  it("recalls memory through the graph tools only for the server's workspace", async () => {
    await focusOn("Recall me push");
    await SELF.fetch("https://example.test/agent/memory/remember", { method: "POST" });
    const backend = knowledgeGraphBackend({});
    const mine = await connectKnowledgeGraphTools(backend, {
      workspaceId: PROOF_DEFAULTS.workspaceId,
      now: () => new Date(),
    });
    const other = await connectKnowledgeGraphTools(backend, {
      workspaceId: "another-workspace",
      now: () => new Date(),
    });
    const plain = await connectKnowledgeGraphTools(backend);
    try {
      expect(Object.keys(plain.tools)).not.toContain("graph_recall_decisions");
      const recall = (tools: typeof mine.tools) =>
        (
          tools.graph_recall_decisions as unknown as {
            execute: (input: unknown) => Promise<{ structuredContent: { count: number } }>;
          }
        ).execute({ subject: "Recall me push", limit: 5 });
      expect((await recall(mine.tools)).structuredContent.count).toBe(1);
      expect((await recall(other.tools)).structuredContent.count).toBe(0);
    } finally {
      await mine.close();
      await other.close();
      await plain.close();
    }
  });

  it("forgets a memory, records the forget in the audit export, and 404s a repeat", async () => {
    await focusOn("Forget me push");
    const remembered = (await (
      await SELF.fetch("https://example.test/agent/memory/remember", { method: "POST" })
    ).json()) as { id: string };
    const forget = () =>
      SELF.fetch(`https://example.test/agent/memory/${remembered.id}`, { method: "DELETE" });
    expect((await forget()).status).toBe(200);
    expect((await listMemory()).items.some((item) => item.id === remembered.id)).toBe(false);
    expect((await forget()).status).toBe(404);
    const audit = (await (await SELF.fetch("https://example.test/agent/audit/export")).json()) as {
      memory: Array<{ action: string; memoryId: string }>;
    };
    expect(audit.memory).toContainEqual(
      expect.objectContaining({ action: "forget", memoryId: remembered.id }),
    );
  });

  it("reopens a remembered draft as the focus in a new chat, and audits it", async () => {
    await focusOn("Reopen me push");
    const remembered = (await (
      await SELF.fetch("https://example.test/agent/memory/remember", { method: "POST" })
    ).json()) as { id: string };
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const response = await SELF.fetch(`https://example.test/agent/memory/${remembered.id}/reopen`, {
      method: "POST",
    });
    expect(await response.json()).toMatchObject({ title: "Reopen me push", focus: true });
    const focus = await runInDurableObject(
      await agentStubFor(),
      (instance) =>
        (instance as unknown as { state: { workingSet: WorkingSet } }).state.workingSet.focus,
    );
    expect(focus?.versions[0]).toMatchObject({ title: "Reopen me push" });
    expect(focus?.versions[0]?.changeNote).toMatch(/^Reopened from memory/);
    const audit = (await (await SELF.fetch("https://example.test/agent/audit/export")).json()) as {
      memory: Array<{ action: string; memoryId: string }>;
    };
    expect(audit.memory).toContainEqual(
      expect.objectContaining({ action: "reopen", memoryId: remembered.id }),
    );
  });

  it("answers a recall question in a new chat from memory, without the model locally", async () => {
    await focusOn("Weekend brunch push");
    await SELF.fetch("https://example.test/agent/memory/remember", { method: "POST" });
    const stub = await agentStubFor();
    const text = await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as {
        messages: unknown[];
        onChatMessage: (onFinish: unknown) => Promise<Response>;
      };
      agent.messages = [
        {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "What did we decide about the weekend brunch push?" }],
        },
      ];
      return (await agent.onChatMessage(() => undefined)).text();
    });
    expect(text).toContain("Weekend brunch push");
    expect(text).toMatch(/re-check Salesforce/);
  });
});
