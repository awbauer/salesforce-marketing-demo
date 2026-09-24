import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBlockedWords, parseBlockedWords } from "./check-blocked-words.mjs";

async function repository() {
  const cwd = await mkdtemp(join(tmpdir(), "blocked-word-gate-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "gate@example.invalid"], { cwd });
  execFileSync("git", ["config", "user.name", "Gate Test"], { cwd });
  await writeFile(join(cwd, ".gitignore"), "/.config/blocked-words.local\n");
  await mkdir(join(cwd, ".config"));
  return cwd;
}

describe("blocked-word delivery gate", () => {
  it("parses literal values while ignoring blanks and comments", () => {
    expect(parseBlockedWords("# note\n first value \n\nsecond-value\n")).toEqual([
      "first value",
      "second-value",
    ]);
  });

  it("fails closed when the local list is missing or empty", async () => {
    const cwd = await repository();
    await expect(checkBlockedWords({ cwd })).rejects.toThrow("Missing local blocked-word");
    await writeFile(join(cwd, ".config/blocked-words.local"), "# no entries\n");
    await expect(checkBlockedWords({ cwd })).rejects.toThrow("has no entries");
  });

  it("finds a configured literal without returning the literal", async () => {
    const cwd = await repository();
    const blocked = `sensitive-${crypto.randomUUID()}`;
    await writeFile(join(cwd, ".config/blocked-words.local"), `${blocked}\n`);
    await writeFile(join(cwd, "safe.txt"), "safe\n");
    await writeFile(join(cwd, "leak.txt"), `prefix ${blocked} suffix\n`);
    const result = await checkBlockedWords({ cwd });
    expect(result.findings.some((finding) => finding.path === "leak.txt")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(blocked);
  });

  it("scans staged snapshots and local commit history", async () => {
    const cwd = await repository();
    const blocked = `history-${crypto.randomUUID()}`;
    await writeFile(join(cwd, ".config/blocked-words.local"), `${blocked}\n`);
    await writeFile(join(cwd, "history.txt"), `${blocked}\n`);
    execFileSync("git", ["add", ".gitignore", "history.txt"], { cwd });
    execFileSync("git", ["commit", "-qm", "local history"], { cwd });
    await writeFile(join(cwd, "history.txt"), "safe worktree value\n");

    const result = await checkBlockedWords({ cwd });
    expect(result.findings.some((finding) => finding.source.startsWith("commit "))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(blocked);
  });
});
