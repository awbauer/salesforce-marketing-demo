import { PHASE_2_CURATED_TOOLS } from "../packages/contracts/src/index.ts";
import { report } from "./lib/report.mjs";

const required = ["PROOF_BASE_URL", "CF_ACCESS_JWT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  await report("production-chat", {
    status: "blocked",
    boundary: "human_authorization_or_credentials",
    missing,
  });
  console.error(`Production chat proof requires: ${missing.join(", ")}`);
  process.exit(2);
}

const headers = {
  "content-type": "application/json",
  "Cf-Access-Jwt-Assertion": process.env.CF_ACCESS_JWT,
};
const statusResponse = await fetch(
  new URL("/agent/salesforce/status", process.env.PROOF_BASE_URL),
  { headers, signal: AbortSignal.timeout(15_000) },
);
const connector = await readJson(statusResponse);
const preflightResponse = await fetch(
  new URL("/agent/diagnostics/salesforce-write-preflight", process.env.PROOF_BASE_URL),
  { method: "POST", headers, signal: AbortSignal.timeout(15_000) },
);
const preflight = await readJson(preflightResponse);
const response = await fetch(new URL("/agent/diagnostics/chat", process.env.PROOF_BASE_URL), {
  method: "POST",
  headers,
  body: JSON.stringify({ scenario: "campaign-summary" }),
  signal: AbortSignal.timeout(60_000),
});
const contentType = response.headers.get("content-type") ?? "";
const stream = await response.text();
const checks = {
  authenticated: response.status !== 401 && response.status !== 403,
  completeSalesforceCatalog:
    statusResponse.ok &&
    connector.state === "ready" &&
    connector.toolCount === PHASE_2_CURATED_TOOLS.length,
  permissionPreflight:
    preflightResponse.ok &&
    preflight.permissions?.source === "salesforce" &&
    preflight.permissions?.allowed === true &&
    preflight.permissions?.checks?.length > 0,
  streamingResponse: response.ok && contentType.includes("text/event-stream"),
  governedToolSelected: /summarize_campaign/.test(stream),
  toolCompleted: /tool-output-available/.test(stream),
  assistantTextCompleted: /text-end/.test(stream),
  noStreamError: !/"type":"(?:error|abort)"/.test(stream),
  turnTraced: /"type":"data-turn-trace"/.test(stream),
  traceCompleted: /"kind":"turn-finish","outcome":"completed"/.test(stream),
  noRecoveryFallback: !/"kind":"fallback-text"/.test(stream),
};
const passed = Object.values(checks).every(Boolean);
await report("production-chat", {
  status: passed ? "passed" : "failed",
  httpStatus: response.status,
  connectorStatus: statusResponse.status,
  preflightStatus: preflightResponse.status,
  checks,
});
if (!passed) {
  console.error("Production chat protocol check failed.");
  process.exit(1);
}
console.log("Production chat protocol check passed.");

async function readJson(response) {
  const responseContentType = response.headers.get("content-type") ?? "";
  if (!responseContentType.includes("application/json")) return {};
  try {
    return await response.json();
  } catch {
    return {};
  }
}
