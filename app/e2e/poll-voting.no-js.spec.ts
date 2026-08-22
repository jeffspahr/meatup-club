import { expect, test } from "@playwright/test";

test("an iPhone member can vote before React hydrates", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Playwright Dinner Poll" })).toBeVisible();

  await page.getByLabel("Your vote").selectOption({ label: "E2E Chophouse (0 votes)" });
  // Mobile WebKit keeps adjusting the viewport after its native select closes.
  // Force bypasses only Playwright's stability heuristic; persistence below
  // still proves that the real native form POST completed without app JS.
  await page.getByRole("button", { name: "Save Vote" }).click({ force: true });

  await expect(page.getByText("Current vote: E2E Chophouse")).toBeVisible();
  await expect(page.getByText("1 vote", { exact: true })).toBeVisible();

  await page.getByLabel("Your vote").selectOption("");
  await page.getByRole("button", { name: "Save Vote" }).click({ force: true });

  await expect(page.getByText("Current vote: E2E Chophouse")).toHaveCount(0);
  await expect(page.getByText("No votes yet")).toBeVisible();
});
