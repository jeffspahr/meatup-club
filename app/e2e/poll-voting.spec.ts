import { expect, test } from "@playwright/test";

test("an authenticated member can cast, replace, and remove a restaurant vote", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Playwright Dinner Poll" })).toBeVisible();

  const restaurantVote = page.getByLabel("Your vote");
  const submitVote = page.getByRole("button", { name: "Save Vote" });
  await restaurantVote.selectOption({ label: "E2E Chophouse (0 votes)" });
  await submitVote.click();

  await expect(page.getByText("Current vote: E2E Chophouse")).toBeVisible();
  await expect(page.getByText("1 vote", { exact: true })).toBeVisible();

  await restaurantVote.selectOption({ label: "E2E Steakhouse (0 votes)" });
  await submitVote.click();
  await expect(page.getByText("Current vote: E2E Steakhouse")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Current vote: E2E Steakhouse")).toBeVisible();

  await restaurantVote.selectOption("");
  await page.getByRole("button", { name: "Save Vote" }).click();
  await expect(page.getByText("Current vote: E2E Steakhouse")).toHaveCount(0);
  await expect(page.getByText("No votes yet")).toBeVisible();
});
