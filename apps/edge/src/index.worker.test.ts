import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { type AuthError, deriveAgentKey, resolvePrincipal } from "./auth";
import { classifyMcpFailure } from "./orchestrator";

describe("edge runtime", () => {
  it("returns structured health", async () => {
    const response = await SELF.fetch("https://example.test/api/health", {
      headers: { "x-correlation-id": "test-correlation" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "northstar-edge",
      correlationId: "test-correlation",
    });
  });
  it("derives a stable key without accepting one from the browser", async () => {
    const first = await SELF.fetch("https://example.test/api/session");
    const second = await SELF.fetch("https://example.test/api/session?agentKey=browser-controlled");
    const a = (await first.json()) as { agentKey: string };
    const b = (await second.json()) as { agentKey: string };
    expect(a.agentKey).toMatch(/^wk_[a-f0-9]{32}$/);
    expect(b.agentKey).toBe(a.agentKey);
  });
  it("uses structured errors for missing API routes", async () => {
    const response = await SELF.fetch("https://example.test/api/missing");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
  it("reports configured proof bindings", async () => {
    const response = await SELF.fetch("https://example.test/api/ready");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checks: { durableObject: true, workersAi: true, d1: true, r2: true },
    });
  });
  it("isolates agent keys by authenticated subject and workspace", async () => {
    const first = await deriveAgentKey(
      { subject: "evaluator-a", email: "a@northstar.example", role: "evaluator", tenantId: "pot" },
      "northstar-demo",
    );
    const otherUser = await deriveAgentKey(
      { subject: "evaluator-b", email: "b@northstar.example", role: "evaluator", tenantId: "pot" },
      "northstar-demo",
    );
    const otherWorkspace = await deriveAgentKey(
      { subject: "evaluator-a", email: "a@northstar.example", role: "evaluator", tenantId: "pot" },
      "other-workspace",
    );
    expect(new Set([first, otherUser, otherWorkspace]).size).toBe(3);
  });
  it("fails closed outside explicit local development", async () => {
    await expect(
      resolvePrincipal(new Request("https://example.test/api/session"), {
        AUTH_MODE: "access",
        ENVIRONMENT: "proof",
      }),
    ).rejects.toEqual(expect.objectContaining<AuthError>({ code: "UNAUTHENTICATED" }));
  });
  it("reports the configured Salesforce MCP as disconnected until the user authorizes it", async () => {
    const response = await SELF.fetch("https://example.test/agent/salesforce/status");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "salesforce",
      state: "disconnected",
      toolCount: 0,
    });
  });
  it("classifies expired and permission-denied MCP recovery states", () => {
    expect(classifyMcpFailure("OAuth token expired")).toMatchObject({
      state: "expired",
      errorCode: "AUTH_REQUIRED",
    });
    expect(classifyMcpFailure("403 permission denied")).toMatchObject({
      state: "error",
      errorCode: "PERMISSION_DENIED",
    });
    expect(classifyMcpFailure("connection reset")).toMatchObject({
      state: "error",
      errorCode: "UPSTREAM_UNAVAILABLE",
    });
  });
  it("requires a bounded server-side confirmation before the local review fixture", async () => {
    const missing = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(missing.status).toBe(409);

    const preflight = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create-review-task",
        recordId: "701jV000004GglIQAS",
        summary: "Create a review task for the current blockers.",
      }),
    });
    expect(preflight.status).toBe(201);
    const confirmation = (await preflight.json()) as {
      id: string;
      idempotencyKey: string;
      requestHash: string;
      status: string;
    };
    expect(confirmation).toMatchObject({ status: "pending" });
    expect(confirmation.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(confirmation.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
    expect(confirmation.requestHash).toMatch(/^[a-f0-9]{64}$/);

    const execute = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(execute.status).toBe(200);
    await expect(execute.json()).resolves.toMatchObject({
      result: {
        source: "local-fixture",
        campaignId: "701jV000004GglIQAS",
        subject: "Review campaign readiness: VERO Phase 1 Launch",
        priority: "High",
        dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        description: expect.stringContaining("readiness findings"),
        readBack: true,
        idempotencyKey: confirmation.idempotencyKey,
      },
    });
    const audit = await env.APP_DB.prepare(
      "SELECT status, source_record_id FROM confirmation_audit WHERE idempotency_key = ?",
    )
      .bind(confirmation.idempotencyKey)
      .first<{ status: string; source_record_id: string }>();
    expect(audit).toEqual({ status: "executed", source_record_id: "00T000000000001" });

    const duplicate = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(duplicate.status).toBe(409);
  });
  it("rejects malformed confirmation scope", async () => {
    const response = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", recordId: "all", summary: "Do it" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });
  it("binds a confirmed local draft save to its campaign and idempotency key", async () => {
    const preflight = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save-draft-campaign",
        recordId: "701jV000004GglIQAS",
        summary: "A bounded fictional Northstar draft brief.",
      }),
    });
    expect(preflight.status).toBe(201);
    const confirmation = (await preflight.json()) as { idempotencyKey: string };
    const execute = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(execute.status).toBe(200);
    await expect(execute.json()).resolves.toMatchObject({
      result: {
        source: "local-fixture",
        recordId: "701jV000004GglIQAS",
        campaignId: "701jV000004GglIQAS",
        idempotencyKey: confirmation.idempotencyKey,
        readBack: true,
      },
    });
  });
});
