import { expect, test } from "@playwright/test";

test("opens the workspace, renders evidence tiles, and completes a durable turn", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketing workbench" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign intelligence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generate campaign visual" })).toBeVisible();
  await expect(page.getByText("14 configured tools")).toBeVisible();
  const campaignLink = page.getByRole("link", { name: /Open in Salesforce/ }).first();
  await expect(campaignLink).toHaveAttribute(
    "href",
    "https://pu1788182184076.my.salesforce.com/lightning/r/Campaign/701jV000004GglIQAS/view",
  );
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.locator(".messages .message.user")).toHaveCount(0);
  await page.getByLabel("Message the orchestrator").focus();
  await expect(page.getByLabel("Message the orchestrator")).toBeFocused();
  await expect(page.getByTestId("tile-readiness")).toContainText("Needs refresh");
  const assistantMessages = page.locator(".message.assistant");
  const before = await assistantMessages.count();
  await page.getByLabel("Message the orchestrator").fill("Review the sample campaign readiness");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => assistantMessages.count(), { timeout: 15_000 }).toBeGreaterThan(before);
  await expect(page.getByText(/strongest signal is stable engagement/i).last()).toBeVisible();
  // Assistant Markdown renders as formatted elements, not literal asterisks.
  const reply = page.locator(".message.assistant .markdown").last();
  await expect(reply.locator("strong").first()).toHaveText("strongest signal is stable engagement");
  await expect(reply.locator("li")).toHaveText(["Accessibility copy", "Commercial-consent scope"]);
  await expect(reply).not.toContainText("**");
  await expect(page.getByText("Restaurant data")).toBeVisible();
  await expect(page.getByText("Weather · Open-Meteo")).toBeVisible();
  const trace = page.locator(".execution-trace").last();
  await trace.getByText("Behind the scenes · technical trace").click();
  for (const label of [
    "Turn started",
    "Step 1 started",
    "Reasoning started",
    /Reasoning ended in/,
    "Text started",
    /Text ended in/,
    "Turn completed",
  ])
    await expect(trace.getByText(label, { exact: typeof label === "string" })).toBeVisible();
  await trace.getByText("Model reasoning").click();
  await expect(trace.getByText(/answer from the fictional local fixture/i)).toBeVisible();
  await expect(trace.getByText(/personal data are redacted/i)).toBeVisible();
  await trace.screenshot({
    path: `artifacts/evidence/WU-016/technical-trace-detail-${testInfo.project.name}.png`,
  });
  await page.screenshot({
    path: `artifacts/evidence/WU-016/technical-trace-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create review request" }).click();
  await expect(page.getByRole("heading", { name: "Create Salesforce review task?" })).toBeVisible();
  await expect(
    page.locator(".confirmation-card").getByRole("link", { name: /701jV000004GglIQAS/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-006/confirmation-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const completedReviews = page.getByText("Review request created");
  const completedBefore = await completedReviews.count();
  await page.getByRole("button", { name: "Confirm create" }).click();
  await expect.poll(() => completedReviews.count()).toBeGreaterThan(completedBefore);
  await expect(page.getByText(/Local fixture read-back/).last()).toBeVisible();
  await expect(page.getByRole("link", { name: /Open task in Salesforce/ })).toHaveAttribute(
    "href",
    /\/lightning\/r\/Task\/[a-zA-Z0-9]+\/view$/,
  );
  await page.screenshot({
    path: `artifacts/evidence/WU-006/created-task-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText("Review the sample campaign readiness").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: `artifacts/evidence/WU-006/workbench-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("shows an actionable recovery state when Salesforce authorization expires", async ({
  page,
}, testInfo) => {
  await page.route("**/agent/salesforce/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "salesforce",
        label: "Salesforce agents",
        state: "expired",
        toolCount: 0,
        message: "Your Salesforce authorization expired. Reconnect to continue.",
        errorCode: "AUTH_REQUIRED",
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByText("Your Salesforce authorization expired.")).toBeVisible();
  await expect(page.getByText("expired", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-006/oauth-recovery-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("renders the accessible native fallback when the HXL resource is unavailable", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const readiness = page.getByTestId("tile-readiness");
  await expect(readiness).toBeVisible();
  await expect(readiness).toHaveAttribute("data-render-mode", "native");
  await expect(readiness).toHaveAttribute(
    "data-hxl-resource",
    "ui://widget/lightningType/c__northstarCampaignReadinessOutput",
  );
  await expect(readiness.getByText("Native fallback")).toBeVisible();
  await expect(readiness.getByRole("heading", { name: "2 blockers before review" })).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-006/native-fallback-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("offers a quickstart with supported prompts and honest roadmap boundaries", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quickstart" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Start with a real workflow" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Try now" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Coming soon / not yet built" })).toBeVisible();
  await expect(dialog.getByText(/Publishing, sending, activation/)).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-006/quickstart-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const prompt = "Check the sample campaign readiness and explain every blocker";
  await dialog.getByRole("button", { name: prompt }).click();
  await expect(page.getByLabel("Message the orchestrator")).toHaveValue(prompt);
});

test("routes chat write requests to the confirmation flow without claiming a write", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).click();
  await page.getByLabel("Message the orchestrator").fill("Save this campaign now");
  await page.getByRole("button", { name: "Send message" }).click();
  const reply = page.locator(".message.assistant").last();
  await expect(reply).toContainText("nothing has been saved or created");
  await expect(reply).not.toContainText(/has been saved and/i);
  const trace = reply.locator(".execution-trace");
  await trace.getByText("Behind the scenes · technical trace").click();
  await expect(trace.getByText(/policy router without a model call/i)).toBeVisible();
  await page.getByLabel("Message the orchestrator").fill("Publish and send the campaign");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message.assistant").last()).toContainText("I didn't take it");
  await page.screenshot({
    path: `artifacts/evidence/WU-019/policy-route-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("attaches a selected image draft only after an explicit confirmation", async ({
  page,
}, testInfo) => {
  const imageId = "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b";
  const contentHash = "a".repeat(64);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const confirmation = {
    id: "0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
    action: "attach-generated-image",
    recordId: "701jV000004GglIQAS",
    imageId,
    contentHash,
    principalSubject: "local-evaluator",
    requestHash: "b".repeat(64),
    idempotencyKey: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
    summary: "Attach the selected email image draft to the campaign as a Salesforce file.",
    expiresAt,
    status: "pending",
  };
  let attachRequest: unknown;
  await page.route("**/agent/images/generate", (route) =>
    route.fulfill({
      status: 201,
      json: {
        id: imageId,
        campaignId: "701jV000004GglIQAS",
        imageUrl: `/agent/images/${imageId}`,
        promptSummary: "A quiet trailhead at golden hour",
        channel: "email",
        width: 1024,
        height: 1024,
        contentHash,
        model: "@cf/black-forest-labs/flux-2-klein-4b",
        lifecycle: "draft",
        expiresAt,
      },
    }),
  );
  await page.route(`**/agent/images/${imageId}`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
  await page.route("**/agent/confirmations", (route) => {
    attachRequest = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: confirmation });
  });
  await page.route("**/agent/confirmations/execute", (route) =>
    route.fulfill({
      status: 200,
      json: {
        confirmation: { ...confirmation, status: "executed" },
        result: {
          source: "salesforce",
          recordId: "069jV000000AbCdQAK",
          contentVersionId: "068jV000000AbCdQAK",
          campaignId: "701jV000004GglIQAS",
          title: "Northstar email campaign image",
          contentSize: 1_482_113,
          contentHash,
          readBack: true,
        },
      },
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await page.getByRole("button", { name: "Attach to campaign" }).click();
  expect(attachRequest).toEqual({
    action: "attach-generated-image",
    recordId: "701jV000004GglIQAS",
    imageId,
  });
  const card = page.locator(".confirmation-card");
  await expect(
    card.getByRole("heading", { name: "Attach image to the Salesforce campaign?" }),
  ).toBeVisible();
  await expect(card.getByRole("img", { name: /Draft to attach/ })).toBeVisible();
  await expect(card.getByText(contentHash.slice(0, 16))).toBeVisible();
  await card.getByRole("button", { name: "Confirm attach" }).click();
  const banner = page.locator(".success-banner");
  await expect(banner.getByText("Image attached to the campaign")).toBeVisible();
  await expect(banner.getByRole("link", { name: /Open file in Salesforce/ })).toHaveAttribute(
    "href",
    "https://pu1788182184076.my.salesforce.com/lightning/r/ContentDocument/069jV000000AbCdQAK/view",
  );
  await expect(page.getByText("Attached to the campaign", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach to campaign" })).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/evidence/WU-020/image-attached-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("shows an honest empty state before any evaluation run is published", async ({ page }) => {
  // Production serves the app shell for unknown paths, so a missing report arrives as HTML.
  await page.route("**/evals/latest.json", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Evaluations" }).first().click();
  await expect(page.getByRole("heading", { name: "Evaluations" })).toBeVisible();
  await expect(page.getByText("No evaluation run has been published yet.")).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(page.getByRole("heading", { name: "Campaign intelligence" })).toBeVisible();
});

test("renders model comparison, checks, scenarios, failures, and methodology", async ({
  page,
}, testInfo) => {
  // Synthetic rendering fixture only; published results come from pnpm eval:live.
  const checks = {
    toolCorrect: true,
    textProduced: true,
    noToolErrors: true,
    noFalseWriteClaim: true,
  };
  const result = (model: string, passed: boolean, trial: number) => ({
    model,
    suite: "demo-scenarios",
    caseId: "demo-summary",
    prompt: "Summarize the sample campaign and its recent performance",
    expected: "summarize_campaign",
    trial,
    route: "model",
    toolCalled: passed ? "summarize_campaign" : null,
    checks: { ...checks, toolCorrect: passed, textProduced: passed },
    passed,
    latencyMs: 8000,
    inputTokens: 1200,
    outputTokens: 300,
    steps: passed ? "tool-calls,stop" : "tool-calls,length",
    excerpt: passed ? "VERO Phase 1 Launch is in progress." : "",
    ...(passed ? {} : { failure: "toolCorrect, textProduced" }),
  });
  const rates = (value: number) =>
    Object.fromEntries(Object.keys(checks).map((check) => [check, value]));
  const summary = (model: string, suite: string, passed: number) => ({
    model,
    suite,
    passed,
    total: 2,
    checkRates: rates(passed / 2),
    latencyP50Ms: 8000,
    latencyP90Ms: 12000,
    meanOutputTokens: 300,
  });
  const suites = ["demo-scenarios", "routing-pipeline", "routing-model-only"];
  await page.route("**/evals/latest.json", (route) =>
    route.fulfill({
      json: {
        generatedAt: "2026-09-26T01:00:00.000Z",
        gitSha: "abcdef1",
        productionModel: "@cf/openai/gpt-oss-120b",
        methodology: {
          summary: "Synthetic methodology summary.",
          pipeline: ["Policy router step."],
          toolResults: "Fixture tool results.",
          suites: suites.map((id) => ({
            id,
            label: `Suite ${id}`,
            description: "Desc.",
            trials: 2,
          })),
          checks: Object.keys(checks).map((id) => ({
            id,
            label: `Check ${id}`,
            definition: "Def.",
          })),
          limitations: ["Synthetic limitation."],
        },
        models: [
          { id: "@cf/openai/gpt-oss-120b", label: "gpt-oss-120b", included: true },
          { id: "@cf/openai/gpt-oss-20b", label: "gpt-oss-20b", included: true },
          { id: "@cf/moonshotai/kimi-k2.6", label: "Kimi K2.6", included: false, note: "Errored." },
        ],
        summaries: suites.flatMap((suite) => [
          summary("@cf/openai/gpt-oss-120b", suite, 2),
          summary("@cf/openai/gpt-oss-20b", suite, 1),
        ]),
        results: [
          result("@cf/openai/gpt-oss-120b", true, 0),
          result("@cf/openai/gpt-oss-120b", true, 1),
          result("@cf/openai/gpt-oss-20b", true, 0),
          result("@cf/openai/gpt-oss-20b", false, 1),
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Evaluations" }).first().click();
  const models = page.locator(".evaluation-card", {
    has: page.getByRole("heading", { name: "Model comparison" }),
  });
  await expect(models.getByText("In production")).toBeVisible();
  await expect(models.getByRole("row", { name: /gpt-oss-20b/ })).toContainText("50%");
  await expect(page.getByText("Kimi K2.6 not evaluated: Errored.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Failed turns .*\(1\)/ })).toBeVisible();
  await page.getByText("called no tool").click();
  await expect(page.getByText("tool-calls,length")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  await page.getByRole("button", { name: "Suite routing-model-only" }).click();
  await expect(page.getByRole("button", { name: "Suite routing-model-only" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({
    path: `artifacts/evidence/WU-021/evaluations-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("records each turn with its interpretation, reasoning, and outcome in history", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).click();
  const composer = page.getByLabel("Message the orchestrator");
  await composer.fill("Review the sample campaign readiness");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/strongest signal is stable engagement/i).last()).toBeVisible();
  await composer.fill("Publish and send the campaign");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message.assistant").last()).toContainText("I didn't take it");

  await page.getByRole("button", { name: "History" }).first().click();
  await expect(page.getByRole("heading", { name: "Turn history" })).toBeVisible();
  // History is per user and survives New chat, so earlier tests' turns may also be listed.
  const blocked = page
    .locator(".history-turn", { hasText: "Publish and send the campaign" })
    .first();
  await expect(blocked.getByText("Blocked action", { exact: true })).toBeVisible();
  const reviewed = page
    .locator(".history-turn", { hasText: "Review the sample campaign readiness" })
    .first();
  await expect(reviewed.getByText("Local fixture", { exact: true })).toBeVisible();
  await reviewed.locator("summary").first().click();
  await expect(reviewed.getByText(/answered from the fictional fixture/i)).toBeVisible();
  await reviewed.getByText("Show reasoning").click();
  await expect(reviewed.getByText(/needs no Salesforce tool/i)).toBeVisible();
  await expect(reviewed.locator(".history-answer")).toContainText("strongest signal");

  await page.getByRole("button", { name: "Policy routed" }).click();
  await expect(page.locator(".history-turn", { hasText: "Review the sample" })).toHaveCount(0);
  await expect(blocked).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-022/turn-history-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("reflects operator kill switches and offers the audit export", async ({ page }, testInfo) => {
  await page.route("**/agent/operations", (route) =>
    route.fulfill({ json: { writesEnabled: false, disabledTools: [] } }),
  );
  await page.goto("/");
  await expect(page.getByText(/Salesforce writes are paused by an operator/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create review request" })).toBeDisabled();
  await expect(page.getByText("Writes paused by an operator")).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-023/writes-paused-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "History" }).first().click();
  await expect(page.getByRole("link", { name: "Export audit (JSON)" })).toHaveAttribute(
    "href",
    "/agent/audit/export",
  );
});

test("reviews persisted image variants and rejects one so it cannot be attached", async ({
  page,
}, testInfo) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const variant = (id: string, promptSummary: string) => ({
    id,
    campaignId: "701jV000004GglIQAS",
    imageUrl: `/agent/images/${id}`,
    promptSummary,
    channel: "email",
    width: 1024,
    height: 1024,
    contentHash: "c".repeat(64),
    model: "@cf/black-forest-labs/flux-2-klein-4b",
    lifecycle: "draft",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const newest = variant("11111111-2222-4333-8444-555555555555", "Sunrise over a ridge trail");
  const older = variant("66666666-7777-4888-8999-000000000000", "Campfire with gear laid out");
  let rejected = "";
  await page.route("**/agent/images?campaignId=*", (route) =>
    route.fulfill({ json: { images: [newest, older] } }),
  );
  await page.route(/\/agent\/images\/[a-f0-9-]{36}$/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
  await page.route(/\/agent\/images\/[a-f0-9-]{36}\/reject$/, (route) => {
    rejected = route.request().url().split("/").at(-2) ?? "";
    return route.fulfill({ json: { id: rejected, lifecycle: "rejected" } });
  });

  await page.goto("/");
  const gallery = page.getByRole("group", { name: "Variants (2)" });
  await expect(gallery.getByRole("button")).toHaveCount(2);
  await expect(page.locator(".generated-image-summary")).toHaveText("Sunrise over a ridge trail");
  await gallery.getByRole("button", { name: /Campfire with gear laid out/ }).click();
  await expect(page.locator(".generated-image-summary")).toHaveText("Campfire with gear laid out");
  await page.getByRole("button", { name: "Reject variant" }).click();
  expect(rejected).toBe(older.id);
  await expect(gallery.getByRole("button", { name: /Campfire.*\(rejected\)/ })).toBeVisible();
  await gallery.getByRole("button", { name: /Campfire/ }).click();
  await expect(page.getByRole("button", { name: "Attach to campaign" })).toHaveCount(0);
  await expect(page.getByText("Rejected variant")).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-024/image-variants-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("answers a 'create it' follow-up through the confirmation policy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).click();
  const composer = page.getByLabel("Message the orchestrator");
  await composer.fill("Review the sample campaign readiness");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/strongest signal is stable engagement/i).last()).toBeVisible();
  await composer.fill("Looks good, create it");
  await page.getByRole("button", { name: "Send message" }).click();
  const reply = page.locator(".message.assistant").last();
  await expect(reply).toContainText("nothing has been saved or created");
  await expect(reply).toContainText("Create review request");
});
