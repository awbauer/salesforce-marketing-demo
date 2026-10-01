// Applies the container's environment variables to the built Worker's configuration, so the same
// image can run with different auth, models and secrets. `vite preview` reads the built
// wrangler.json, and its `vars` take precedence over .dev.vars, so this is where they are set.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NAMES = [
  "ENVIRONMENT",
  "AUTH_MODE",
  "CHAT_ENGINE",
  "OIDC_ISSUER",
  "OIDC_AUDIENCE",
  "OIDC_JWKS_URL",
  "OIDC_JWKS_JSON",
  "ALB_ARN",
  "ALLOWED_EMAILS",
  "AWS_REGION",
  "AWS_BEARER_TOKEN_BEDROCK",
  "OLLAMA_BASE_URL",
  "OPENAI_COMPATIBLE_API_KEY",
  "CONFIRMATION_SIGNING_KEY",
  "SALESFORCE_MCP_URL",
  "WRITES_ENABLED",
  "DISABLED_TOOLS",
  "MEMORY_ENABLED",
  "NEO4J_QUERY_URL",
  "NEO4J_USERNAME",
  "NEO4J_PASSWORD",
];

function* configs(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* configs(path);
    else if (entry === "wrangler.json") yield path;
  }
}

const dist = process.argv[2] ?? "dist";
let patched = 0;
for (const path of configs(dist)) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  if (!config.main) continue; // the asset-only client config has no Worker
  config.vars = { ...config.vars };
  for (const name of NAMES) if (process.env[name]) config.vars[name] = process.env[name];
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  patched += 1;
}
if (!patched) {
  console.error(`No built Worker configuration found under ${dist}; run pnpm build first.`);
  process.exit(1);
}
console.log(`Configured ${patched} Worker config(s).`);
