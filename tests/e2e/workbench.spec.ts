import { expect, test } from "@playwright/test";

test("opens the workspace, renders evidence tiles, and completes a durable turn", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketing workbench" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign intelligence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  const campaignLink = page.getByRole("link", { name: /Open in Salesforce/ }).first();
  await expect(campaignLink).toHaveAttribute(
    "href",
    "https://test.salesforce.com/lightning/r/Campaign/701jV000004GglIQAS/view",
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
