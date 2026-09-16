import { expect, test } from "@playwright/test";
import { executeLocalD1File } from "./d1";

const cleanup = new URL("./fixtures/admin-poll-cleanup.sql", import.meta.url);
test.beforeEach(() => {
  executeLocalD1File(cleanup);
  executeLocalD1File(new URL("./fixtures/admin-poll.sql", import.meta.url));
});
test.afterEach(() => executeLocalD1File(cleanup));

test("admin event SMS defaults to unanswered RSVPs and offers all opted-in members", async ({ page }, testInfo) => {
  await page.goto("/dashboard/admin/events");
  const recipients = page.getByRole("combobox", { name: "Recipients", exact: true }).first();
  await expect(recipients).toHaveValue("pending");
  const form = recipients.locator("xpath=ancestor::form");
  await expect(form.getByRole("button", { name: "Send SMS notification" })).toBeVisible();
  const screenshotPath = testInfo.outputPath("admin-event-sms.png");
  await form.screenshot({ path: screenshotPath, animations: "disabled", style: ".nav-shell { visibility: hidden; }" });
  await testInfo.attach("admin-event-sms", { path: screenshotPath, contentType: "image/png" });
  await recipients.selectOption("all");
  await expect(recipients).toHaveValue("all");
  await recipients.selectOption("pending");
  // Checking the form never sends a real message.
});
