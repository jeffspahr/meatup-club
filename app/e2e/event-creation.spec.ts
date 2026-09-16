import { expect, test } from "@playwright/test";

test("creates an event from a restaurant selection and preserves it after reload", async ({ page }, testInfo) => {
  const restaurantName = `E2E Created Steakhouse ${testInfo.project.name}`;
  await page.route("**/api/places/search?*", (route) => route.fulfill({ json: {
    places: [{ id: "e2e-created", displayName: { text: restaurantName }, formattedAddress: "5 Browser Way" }],
  } }));
  await page.route("**/api/places/details?*", (route) => route.fulfill({ json: {
    placeId: "e2e-created", name: restaurantName, address: "5 Browser Way",
  } }));

  await page.goto("/dashboard");
  await page.reload();
  await page.getByRole("button", { name: "+ Create Ad Hoc Event" }).click();
  await page.getByLabel("Restaurant *", { exact: true }).fill("E2E Created");
  const suggestion = page.getByRole("button", { name: `${restaurantName} 5 Browser Way` });
  if (testInfo.project.name === "webkit-iphone") {
    await suggestion.tap();
  } else {
    await suggestion.click();
  }
  await expect(page.getByLabel("Address", { exact: true })).toHaveValue("5 Browser Way");
  await page.getByLabel("Event Date *", { exact: true }).fill("2099-04-20");
  await page.getByLabel("Event Time", { exact: true }).fill("19:30");
  await page.getByLabel("Send calendar invites to all active members").uncheck();

  const submission = page.waitForRequest((request) => request.method() === "POST");
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  const body = new URLSearchParams((await submission).postData() || "");
  expect(body.get("restaurant_name")).toBe(restaurantName);
  expect(body.get("restaurant_address")).toBe("5 Browser Way");
  await expect(page.getByRole("article", { name: restaurantName, exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("article", { name: restaurantName, exact: true })).toBeVisible();
});
