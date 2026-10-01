// Deploys this instance to your Cloudflare account. Safe by default: it renders the config and
// runs `wrangler deploy --dry-run`. Nothing is created or changed until you pass a flag AND
// type the instance id to confirm.
//
//   node templates/cloudflare/deploy-cloudflare.mjs               render + dry run
//   node templates/cloudflare/deploy-cloudflare.mjs --provision   create the D1 database and R2 bucket
//   D1_DATABASE_ID=<id> node templates/cloudflare/deploy-cloudflare.mjs --apply   deploy
//
// Environment: D1_DATABASE_ID (from --provision), WORKER_NAME, AI_GATEWAY_ID, and for a
// Salesforce sandbox SALESFORCE_MCP_URL. Secrets are set separately; see README.md.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { InstanceProfileSchema } from "../../packages/contracts/src/profile.ts";
import {
  PLACEHOLDER_D1_ID,
  readTemplate,
  renderWranglerConfig,
  templateValues,
} from "./render.mjs";

const args = new Set(process.argv.slice(2));
const profilePath = existsSync("workbench.profile.json")
  ? "workbench.profile.json"
  : "profiles/example.profile.json";
const profile = InstanceProfileSchema.parse(JSON.parse(readFileSync(profilePath, "utf8")));
const values = templateValues(profile, process.env);
const out = "wrangler.cloudflare.jsonc";

const run = (command, commandArgs) => {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
async function confirm(action) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `${action}\nType the instance id (${profile.instance.id}) to continue: `,
  );
  rl.close();
  if (answer.trim() !== profile.instance.id) {
    console.error("Not confirmed. Nothing was changed.");
    process.exit(1);
  }
}

if (args.has("--provision")) {
  await confirm(
    `This creates a D1 database and an R2 bucket named ${values.WORKER_NAME} in the account wrangler is logged into.`,
  );
  run("pnpm", ["exec", "wrangler", "d1", "create", values.WORKER_NAME]);
  run("pnpm", [
    "exec",
    "wrangler",
    "r2",
    "bucket",
    "create",
    `${values.WORKER_NAME}-campaign-assets`,
  ]);
  console.log("\nCopy the database_id above into D1_DATABASE_ID, then rerun without --provision.");
  process.exit(0);
}

writeFileSync(
  out,
  renderWranglerConfig(readTemplate("templates/cloudflare/wrangler.cloudflare.jsonc.tmpl"), values),
);
console.log(`Rendered ${out} for ${profile.instance.id} (${profilePath}).`);
if (values.D1_DATABASE_ID === PLACEHOLDER_D1_ID)
  console.warn("D1_DATABASE_ID is not set: this render is only good for a dry run.");

run("pnpm", ["build"]);
if (args.has("--apply")) {
  if (values.D1_DATABASE_ID === PLACEHOLDER_D1_ID) {
    console.error("Set D1_DATABASE_ID before deploying (see --provision).");
    process.exit(1);
  }
  await confirm(`This deploys ${values.WORKER_NAME} to your Cloudflare account.`);
  run("pnpm", ["exec", "wrangler", "deploy", "--config", out]);
} else {
  run("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", out]);
  console.log("\nDry run only. Pass --apply (with D1_DATABASE_ID set) to deploy.");
}
