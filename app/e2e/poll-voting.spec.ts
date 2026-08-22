import { expect, test } from "@playwright/test";

test("an authenticated member can cast and remove a restaurant vote", async ({ page }) => {
  await page.goto("/dashboard");
  // The first authenticated request primes Cloudflare Vite's development
  // bundle. Reload before interacting so the page is hydrated on a cold CI runner.
  await page.reload();

  await expect(page.getByRole("heading", { name: "Playwright Dinner Poll" })).toBeVisible();

  const restaurantVote = page.getByLabel("Your vote");
  const submitVote = page.getByRole("button", { name: "Submit Vote" });
  await expect(async () => {
    // Force a value transition on every attempt so React receives a change
    // event even if the first selection happened before hydration completed.
    await restaurantVote.selectOption("");
    await restaurantVote.selectOption({ label: "E2E Chophouse (0 votes)" });
    await expect(submitVote).toBeEnabled();
  }).toPass();
  await submitVote.click();

  await expect(page.getByText("Current vote: E2E Chophouse")).toBeVisible();
  await expect(page.getByText("1 vote", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Current vote: E2E Chophouse")).toBeVisible();

  const removeVote = page.getByRole("button", { name: "Remove Vote" });
  await expect(async () => {
    await restaurantVote.selectOption({ label: "E2E Chophouse (1 vote)" });
    await restaurantVote.selectOption("");
    await expect(removeVote).toBeEnabled();
  }).toPass();
  await removeVote.click();
  await expect(page.getByText("Current vote: E2E Chophouse")).toHaveCount(0);
  await expect(page.getByText("No votes yet")).toBeVisible();
});
