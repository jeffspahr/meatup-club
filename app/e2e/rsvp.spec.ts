import { expect, test } from "@playwright/test";

test("an authenticated member can change an RSVP and keep it after reload", async ({
  page,
}) => {
  await page.goto("/dashboard");
  // The first authenticated request primes Cloudflare Vite's development
  // bundle. Reload before interacting so the page is hydrated on a cold CI runner.
  await page.reload();

  const event = page.getByRole("article", { name: "E2E Supper Club" });
  await expect(event).toBeVisible();
  await event
    .getByRole("button", { name: "Open details for E2E Supper Club" })
    .click();

  const yesRsvp = event.getByRole("radio", { name: "Yes" });
  const maybeRsvp = event.getByRole("radio", { name: "Maybe" });
  await expect(yesRsvp).toBeChecked();

  const rsvpUpdate = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await event.locator("label", { hasText: "Maybe" }).click();
  await rsvpUpdate;
  await expect(maybeRsvp).toBeChecked();

  await page.reload();
  await event
    .getByRole("button", { name: "Open details for E2E Supper Club" })
    .click();
  await expect(event.getByRole("radio", { name: "Maybe" })).toBeChecked();
  await expect(event.getByRole("radio", { name: "Yes" })).not.toBeChecked();
});
