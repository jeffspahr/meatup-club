import { expect, test } from "@playwright/test";
import { executeLocalD1File } from "./d1";

const cleanup = new URL("./fixtures/admin-poll-cleanup.sql", import.meta.url);
test.beforeEach(() => {
  executeLocalD1File(cleanup);
  executeLocalD1File(new URL("./fixtures/admin-poll.sql", import.meta.url));
});
test.afterEach(() => executeLocalD1File(cleanup));

test("an admin closes a poll and creates its event entirely from the dashboard", async ({ page }, testInfo) => {
  await page.goto("/dashboard");
  await page.reload();
  const poll = page.locator("#poll-900003");
  await expect(poll.getByRole("heading", { name: "E2E Admin Dinner Poll" })).toBeVisible();
  await poll.locator("summary").click();
  const form = poll.getByRole("form", { name: "Close poll" });
  await expect(form.getByLabel("Winning restaurant")).toHaveValue("900001");
  await expect(form.getByLabel("Winning date")).toHaveValue("900003");
  await form.getByLabel("Event time").fill("19:00");
  await form.getByLabel("Send calendar invites to all active members").uncheck();
  const screenshotPath = testInfo.outputPath("dashboard-close-poll.png");
  // Keep the sticky navigation from obscuring this isolated component capture.
  await poll.locator("details").screenshot({ path: screenshotPath, animations: "disabled", style: ".nav-shell { visibility: hidden; }" });
  await testInfo.attach("dashboard-close-poll", { path: screenshotPath, contentType: "image/png" });

  page.once("dialog", async (dialog) => { await dialog.dismiss(); });
  await form.getByRole("button", { name: "Close poll & create event" }).click();
  await expect(poll).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("E2E Chophouse");
    expect(dialog.message()).toContain("Members will not be notified");
    await dialog.accept();
  });
  await form.getByRole("button", { name: "Close poll & create event" }).click();
  await expect(poll).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("article", { name: "E2E Chophouse", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article", { name: "E2E Chophouse", exact: true })).toBeVisible();
  await expect(page.locator("#poll-900003")).toHaveCount(0);
});
