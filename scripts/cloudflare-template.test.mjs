import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_D1_ID,
  renderWranglerConfig,
  templateValues,
} from "../templates/cloudflare/render.mjs";
import { profileFromAnswers } from "./lib/init.mjs";

const template = readFileSync("templates/cloudflare/wrangler.cloudflare.jsonc.tmpl", "utf8");
const profile = profileFromAnswers({ audience: "internal", pack: "retail", brand: "Acme" });

describe("Cloudflare wrangler template", () => {
  it("renders a valid config bound to the operator's resources", () => {
    const config = JSON.parse(
      renderWranglerConfig(template, templateValues(profile, { D1_DATABASE_ID: "abc-123" })),
    );
    expect(config.name).toBe("acme-demo-workbench");
    expect(config.d1_databases[0].database_id).toBe("abc-123");
    expect(config.r2_buckets[0].bucket_name).toBe("acme-demo-workbench-campaign-assets");
    expect(config.vars.AUTH_MODE).toBe("access");
  });

  it("keeps fixtures for a fixture Salesforce and goes to production for a sandbox", () => {
    const fixture = JSON.parse(renderWranglerConfig(template, templateValues(profile)));
    expect(fixture.vars.ENVIRONMENT).toBe("local");
    expect(fixture.vars.SALESFORCE_MCP_URL).toBeUndefined();
    expect(fixture.vars.AI_GATEWAY_ID).toBeUndefined();
    expect(fixture.d1_databases[0].database_id).toBe(PLACEHOLDER_D1_ID);
    const sandboxProfile = profileFromAnswers({
      audience: "internal",
      pack: "retail",
      brand: "Acme",
      salesforce: { mode: "sandbox", mcpUrl: "https://mcp.example.test/mcp" },
    });
    const sandbox = JSON.parse(
      renderWranglerConfig(template, templateValues(sandboxProfile, { AI_GATEWAY_ID: "gw" })),
    );
    expect(sandbox.vars).toMatchObject({
      ENVIRONMENT: "production",
      SALESFORCE_MCP_URL: "https://mcp.example.test/mcp",
      AI_GATEWAY_ID: "gw",
    });
  });

  it("never carries an account id and never leaves a placeholder", () => {
    const text = renderWranglerConfig(template, templateValues(profile));
    expect(text).not.toMatch(/\{\{|account_id/);
  });
});
