// Renders wrangler.cloudflare.jsonc from the template and an instance profile.
import { readFileSync } from "node:fs";

export const PLACEHOLDER_D1_ID = "00000000-0000-0000-0000-000000000000";

/** Values for the template's {{PLACEHOLDERS}}, from the profile and the operator's environment. */
export function templateValues(profile, env = {}) {
  const sandbox = profile.salesforce.mode === "sandbox";
  return {
    WORKER_NAME: env.WORKER_NAME || `${profile.instance.id}-workbench`.slice(0, 54),
    D1_DATABASE_ID: env.D1_DATABASE_ID || PLACEHOLDER_D1_ID,
    // Fixture Salesforce keeps the local behavior (scripted Salesforce, real sign-in); a sandbox
    // switches to the production path, which needs the Hosted MCP URL and the signing secret.
    ENVIRONMENT: sandbox ? "production" : "local",
    AI_GATEWAY_ID: env.AI_GATEWAY_ID || "",
    SALESFORCE_MCP_URL: sandbox ? (profile.salesforce.mcpUrl ?? env.SALESFORCE_MCP_URL ?? "") : "",
  };
}

/** Fills the template, then drops optional variables that have no value. */
export function renderWranglerConfig(template, values) {
  const text = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    if (!(key in values)) throw new Error(`The template uses an unknown placeholder: ${key}`);
    return values[key];
  });
  const config = JSON.parse(text);
  for (const [key, value] of Object.entries(config.vars ?? {}))
    if (value === "") delete config.vars[key];
  return `${JSON.stringify(config, null, 2)}\n`;
}

export const readTemplate = (path) => readFileSync(path, "utf8");
