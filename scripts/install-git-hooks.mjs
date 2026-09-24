import { spawnSync } from "node:child_process";

const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  encoding: "utf8",
});
if (inside.status !== 0 || inside.stdout.trim() !== "true") {
  console.log("Git hook installation skipped outside a Git worktree.");
  process.exit(0);
}

const configured = spawnSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});
if (configured.status !== 0) process.exit(configured.status ?? 1);
console.log("Git hooks installed from .githooks.");
