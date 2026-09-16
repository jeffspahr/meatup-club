import { expect, test } from "@playwright/test";
import { executeLocalD1File } from "./d1";

const smsCleanup = new URL("./fixtures/admin-sms-cleanup.sql", import.meta.url);
const cleanup = new URL("./fixtures/admin-poll-cleanup.sql", import.meta.url);
test.beforeEach(() => {
  executeLocalD1File(smsCleanup);
  executeLocalD1File(cleanup);
  executeLocalD1File(new URL("./fixtures/admin-poll.sql", import.meta.url));
  executeLocalD1File(new URL("./fixtures/admin-sms.sql", import.meta.url));
});
test.afterEach(() => {
  executeLocalD1File(smsCleanup);
  executeLocalD1File(cleanup);
});

test("admin event SMS defaults to unanswered RSVPs and offers all opted-in members", async ({ page }, testInfo) => {
  await page.goto("/dashboard/admin/events");
  const form = page.getByRole("form", { name: "SMS notification for E2E Supper Club" });
  const recipients = form.getByRole("combobox", { name: "Recipients", exact: true });
  await expect(recipients).toHaveValue("pending");
  await expect(form.getByRole("region", { name: "SMS recipient preview" })).toContainText("1 of 2 SMS-eligible members selected");
  await expect(form.getByRole("region")).toContainText("Pending RSVP Member");
  await expect(form.getByRole("button", { name: "Send SMS notification" })).toBeVisible();
  const screenshotPath = testInfo.outputPath("admin-event-sms.png");
  await form.screenshot({ path: screenshotPath, animations: "disabled", style: ".nav-shell { visibility: hidden; }" });
  await testInfo.attach("admin-event-sms", { path: screenshotPath, contentType: "image/png" });
  await recipients.selectOption("all");
  await expect(recipients).toHaveValue("all");
  await expect(form.getByRole("region")).toContainText("2 of 2 SMS-eligible members selected");
  await expect(form.getByRole("region")).toContainText("Playwright Member");
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = form.getByRole("button", { name: "Send SMS notification" }).click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain("2 members (All SMS-opted members)");
  await dialog.dismiss();
  await clickPromise;
  expect(posts).toEqual([]);
  await recipients.selectOption("pending");
  // Checking the form never sends a real message.
});
