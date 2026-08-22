import { expect, test } from "@playwright/test";

test("landing page presents the sign-in entry point", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("let's meat up")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to Meatup Club" })).toHaveAttribute(
    "href",
    "/login"
  );
});

test("public compliance pages expose consistent policy navigation", async ({ page }) => {
  await page.goto("/verification");

  await expect(
    page.getByRole("heading", { name: "Business Verification & SMS Compliance" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "https://meatup.club/privacy" })).toHaveAttribute(
    "href",
    "https://meatup.club/privacy"
  );
  await expect(page.getByRole("link", { name: "https://meatup.club/terms" })).toHaveAttribute(
    "href",
    "https://meatup.club/terms"
  );

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy & SMS Consent" })).toBeVisible();
  await expect(page.getByRole("link", { name: "https://meatup.club/terms" })).toHaveAttribute(
    "href",
    "https://meatup.club/terms"
  );

  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms & Conditions" })).toBeVisible();
  await page.getByRole("link", { name: "/privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);

  await page.goto("/sms-consent");
  await expect(page.getByRole("heading", { name: "SMS Consent & Opt-In" })).toBeVisible();
  await page.getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms$/);
});
