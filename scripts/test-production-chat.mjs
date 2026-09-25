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

const response = await fetch(new URL("/agent/diagnostics/chat", process.env.PROOF_BASE_URL), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "Cf-Access-Jwt-Assertion": process.env.CF_ACCESS_JWT,
  },
  body: JSON.stringify({ scenario: "campaign-summary" }),
  signal: AbortSignal.timeout(60_000),
});
const contentType = response.headers.get("content-type") ?? "";
const stream = await response.text();
const checks = {
  authenticated: response.status !== 401 && response.status !== 403,
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
  checks,
});
if (!passed) {
  console.error("Production chat protocol check failed.");
  process.exit(1);
}
console.log("Production chat protocol check passed.");
