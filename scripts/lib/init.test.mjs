import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKS } from "../../packages/industry-packs/src/index.ts";
import {
  detectOllama,
  mergeBlockedWords,
  personalizeVocabulary,
  profileFromAnswers,
  renderDemoScript,
  slugify,
} from "./init.mjs";

const base = { audience: "internal", pack: "retail", brand: "Acme Outfitters" };

describe("profileFromAnswers", () => {
  it("fills everything from the pack and defaults to local models", () => {
    const profile = profileFromAnswers(base);
    expect(profile.instance.id).toBe("acme-outfitters-demo");
    expect(profile.client.brandVoice).toBe(PACKS.retail.sample.brandVoice);
    expect(profile.useCases).toEqual(PACKS.retail.useCases);
    expect(profile.models.chat).toMatchObject({ provider: "ollama", model: "gpt-oss:20b" });
    expect(profile.models.image.provider).toBe("placeholder");
    expect(profile.salesforce.mode).toBe("fixture");
  });

  it("rejects use cases the pack does not offer", () => {
    expect(() => profileFromAnswers({ ...base, useCases: ["fsi-market-news"] })).toThrow(
      /not offered/,
    );
  });

  it("needs an MCP URL to connect a sandbox", () => {
    expect(() => profileFromAnswers({ ...base, salesforce: { mode: "sandbox" } })).toThrow(
      /Hosted MCP/,
    );
  });

  it("never stores the real client name in the profile", () => {
    const profile = profileFromAnswers({ ...base, realClientName: "Zzyzx Industries" });
    expect(JSON.stringify(profile)).not.toContain("Zzyzx");
  });
});

describe("slugify", () => {
  it("makes safe ids", () => {
    expect(slugify("  Café Nord & Co. ")).toBe("cafe-nord-co");
  });
});

describe("detectOllama", () => {
  it("lists installed models", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ models: [{ name: "gpt-oss:20b" }] }));
    expect(await detectOllama("http://127.0.0.1:11434/v1", fetchImpl)).toEqual(["gpt-oss:20b"]);
  });
  it("returns null when it is not running", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await detectOllama(undefined, fetchImpl)).toBeNull();
  });
});

const reply = (content) => async () =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }));
const names = (prefix, count) =>
  Array.from({ length: count }, (_, i) => `${prefix} ${"abcdefghijkl"[i]}`);
const call = (fetchImpl, forbidden = []) =>
  personalizeVocabulary({
    pack: PACKS.retail,
    brand: "Acme",
    industry: "Retail",
    chat: { baseUrl: "http://127.0.0.1:11434/v1", model: "m" },
    forbidden,
    fetchImpl,
  });

describe("personalizeVocabulary", () => {
  it("keeps the pack's countries, statuses and channels and swaps the names", async () => {
    const payload = JSON.stringify({
      accounts: names("Orchard Partners", 12),
      campaigns: names("Season Push", 5),
    });
    const out = await call(reply(`\`\`\`json\n${payload}\n\`\`\``));
    expect(out.vocabulary.accounts[0]).toEqual({
      ...PACKS.retail.vocabulary.accounts[0],
      name: "Orchard Partners a",
    });
    expect(out.vocabulary.campaigns[1]).toMatchObject({
      id: "camp-winter",
      status: PACKS.retail.vocabulary.campaigns[1].status,
      name: "Season Push b",
    });
  });

  it.each([
    ["wrong counts", { accounts: names("A one", 3), campaigns: names("C one", 5) }],
    [
      "an email address",
      { accounts: [...names("A one", 11), "mail me@x.com"], campaigns: names("C one", 5) },
    ],
    ["a repeated name", { accounts: Array(12).fill("Same Name"), campaigns: names("C one", 5) }],
  ])("rejects %s", async (_label, payload) => {
    await expect(call(reply(JSON.stringify(payload)))).rejects.toThrow();
  });

  it("rejects a name containing a blocked value", async () => {
    const payload = {
      accounts: [...names("A one", 11), "Zzyzx Holdings"],
      campaigns: names("C one", 5),
    };
    await expect(call(reply(JSON.stringify(payload)), ["zzyzx"])).rejects.toThrow(/blocked/);
  });
});

describe("mergeBlockedWords", () => {
  it("adds a value once", () => {
    const once = mergeBlockedWords("alpha\n", "Beta");
    expect(once).toBe("alpha\nBeta\n");
    expect(mergeBlockedWords(once, "beta")).toBe(once);
  });
});

describe("renderDemoScript", () => {
  const profile = profileFromAnswers({ ...base, audience: "external" });
  const useCase = {
    title: "Readiness review",
    scenario: "A launch is tomorrow.",
    prompts: [{ text: "Check readiness", demonstrates: "Governed tools" }],
    writes: "Nothing",
    watch: ["The trace"],
  };
  it("covers the audience, the model state and each use case", () => {
    const text = renderDemoScript({
      profile,
      pack: PACKS.retail,
      useCases: [useCase],
      model: { name: "gpt-oss:20b", baseUrl: "http://127.0.0.1:11434/v1", reachable: false },
    });
    expect(text).toContain("an external client discussion");
    expect(text).toContain("scripted mode");
    expect(text).toContain("### Readiness review");
    expect(text).toContain("“Check readiness”");
  });
});

describe("workbench-init (non-interactive)", () => {
  it("writes the profile and the blocked-words entry under --root", () => {
    const dir = mkdtempSync(join(tmpdir(), "workbench-init-"));
    const answers = join(dir, "answers.json");
    writeFileSync(answers, JSON.stringify({ ...base, realClientName: "Zzyzx Industries" }));
    const run = spawnSync(
      "node",
      ["scripts/workbench-init.mjs", "--answers", answers, "--root", dir, "--skip-build"],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const profile = JSON.parse(readFileSync(join(dir, "workbench.profile.json"), "utf8"));
    expect(profile.client.brand).toBe("Acme Outfitters");
    expect(readFileSync(join(dir, ".config/blocked-words.local"), "utf8")).toBe(
      "Zzyzx Industries\n",
    );
  });
});
