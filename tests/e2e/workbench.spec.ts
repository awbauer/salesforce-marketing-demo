import { expect, test } from "@playwright/test";
test("opens the workspace, renders evidence tiles, and completes a durable turn", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketing workbench" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign intelligence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
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
    page.locator(".confirmation-card").getByText("701000000000001", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/evidence/WU-003/confirmation-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const completedReviews = page.getByText("Review request created");
  const completedBefore = await completedReviews.count();
  await page.getByRole("button", { name: "Confirm create" }).click();
  await expect.poll(() => completedReviews.count()).toBeGreaterThan(completedBefore);
  await expect(page.getByText(/Local fixture read-back/).last()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Review the sample campaign readiness").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: `artifacts/evidence/WU-003/workbench-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
