import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BLOCKLIST_PATH = ".config/blocked-words.local";

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function parseBlockedWords(contents) {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function matchCount(contents, words) {
  return words.filter((word) => contents.includes(word)).length;
}

function nulEntries(value) {
  return value.split("\0").filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

async function assertLocalOnly(configPath, cwd) {
  const tracked = git(["ls-files", "--error-unmatch", "--", configPath], { cwd });
  if (tracked.status === 0) {
    throw new Error(`Blocked-word configuration is tracked by Git: ${configPath}`);
  }
  const ignored = git(["check-ignore", "-q", "--", configPath], { cwd });
  if (ignored.status !== 0) {
    throw new Error(`Blocked-word configuration is not ignored by Git: ${configPath}`);
  }
}

async function scanWorktree(cwd, configPath, words) {
  const listed = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd });
  if (listed.status !== 0)
    throw new Error(`Unable to enumerate repository files: ${listed.stderr}`);
  const findings = [];
  for (const path of nulEntries(listed.stdout)) {
    if (path === configPath) continue;
    try {
      const contents = await readFile(resolve(cwd, path));
      if (contents.includes(0)) continue;
      const matches = matchCount(contents.toString("utf8"), words);
      if (matches) findings.push({ source: "worktree", path, matches });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return findings;
}

function scanGitSnapshot(cwd, configPath, revision, source) {
  const result = git(["grep", "-I", "-l", "-F", "-f", configPath, revision, "--"], { cwd });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Unable to scan ${source}: ${result.stderr}`);
  }
  return result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((entry) => ({ source, path: entry.replace(`${revision}:`, "") }));
}

function localCommits(cwd, tips) {
  const existingTips = tips.filter(
    (tip) => git(["rev-parse", "--verify", "--quiet", `${tip}^{commit}`], { cwd }).status === 0,
  );
  if (!existingTips.length) return [];
  const result = git(["rev-list", ...existingTips, "--not", "--remotes=origin"], { cwd });
  if (result.status !== 0)
    throw new Error(`Unable to enumerate commits being delivered: ${result.stderr}`);
  return unique(result.stdout.split(/\r?\n/u).filter(Boolean));
}

async function readPushTips() {
  if (process.stdin.isTTY) return [];
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/u)[1])
    .filter((sha) => sha && !/^0+$/u.test(sha));
}

export async function checkBlockedWords({ cwd = process.cwd(), configPath, pushTips = [] } = {}) {
  const localConfigPath = configPath ?? process.env.BLOCKED_WORDS_FILE ?? DEFAULT_BLOCKLIST_PATH;
  try {
    await access(resolve(cwd, localConfigPath));
  } catch {
    throw new Error(
      `Missing local blocked-word configuration: ${localConfigPath}. Add one literal value per line.`,
    );
  }
  await assertLocalOnly(localConfigPath, cwd);
  const words = parseBlockedWords(await readFile(resolve(cwd, localConfigPath), "utf8"));
  if (words.length === 0) {
    throw new Error(`Blocked-word configuration has no entries: ${localConfigPath}`);
  }

  const findings = await scanWorktree(cwd, localConfigPath, words);
  findings.push(...scanGitSnapshot(cwd, localConfigPath, "--cached", "index"));

  const tips = pushTips.length ? pushTips : ["HEAD"];
  for (const commit of localCommits(cwd, tips)) {
    findings.push(
      ...scanGitSnapshot(cwd, localConfigPath, commit, `commit ${commit.slice(0, 12)}`),
    );
  }

  return { configPath: localConfigPath, wordCount: words.length, findings };
}

async function main() {
  const pushMode = process.argv.includes("--push");
  const pushTips = pushMode ? await readPushTips() : [];
  const result = await checkBlockedWords({ pushTips });
  if (result.findings.length) {
    console.error(`Blocked-word gate failed with ${result.findings.length} matching file(s).`);
    for (const finding of result.findings) {
      const count = finding.matches ? ` [${finding.matches} blocked value(s)]` : "";
      console.error(`- ${finding.source}: ${finding.path}${count}`);
    }
    console.error("Blocked values are intentionally omitted from output.");
    process.exit(1);
  }
  console.log(`Blocked-word gate passed (${result.wordCount} local value(s); no matches).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Blocked-word gate failed: ${error.message}`);
    process.exit(1);
  });
}
