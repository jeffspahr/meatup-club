import { expect, test } from "@playwright/test";
import { executeLocalD1File } from "./d1";

const cleanup = new URL("./fixtures/admin-poll-cleanup.sql", import.meta.url);
test.beforeEach(() => {
  executeLocalD1File(cleanup);
  executeLocalD1File(new URL("./fixtures/admin-poll.sql", import.meta.url));
});
test.afterEach(() => {
  executeLocalD1File(new URL("./fixtures/member-avatars-cleanup.sql", import.meta.url));
  executeLocalD1File(cleanup);
});

for (const width of [320, 390, 1280]) {
  test(`member details and editing remain reachable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/admin/members");
    const table = page.getByRole("table");
    const row = table.getByRole("row").filter({ hasText: "playwright@localhost" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Deactivate", exact: true })).toBeVisible();
    const assertFits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 640) {
        expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        for (const button of await row.getByRole("button").all()) {
          const box = await button.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        }
      }
    };
    await assertFits();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`members-${width}.png`), fullPage: true });
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    const name = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(name).toBeVisible();
    await name.fill("A very long member name that must remain editable on a phone");
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(row.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  });
}

test("slow avatars do not hold page loading or member controls", async ({ page }) => {
  executeLocalD1File(new URL("./fixtures/member-avatars.sql", import.meta.url));
  await page.setViewportSize({ width: 390, height: 844 });

  let releaseAvatar!: () => void;
  const avatarPending = new Promise<void>(resolve => { releaseAvatar = resolve; });
  let avatarRequested = false;
  await page.route("https://avatars.example.test/**", async route => {
    avatarRequested = true;
    await avatarPending;
    await route.abort();
  });

  try {
    await page.goto("/dashboard/admin/members", { waitUntil: "domcontentloaded" });
    await expect.poll(() => avatarRequested).toBe(true);
    // This times out with eager avatars: the request remains stalled until finally.
    await page.waitForLoadState("load", { timeout: 3_000 });
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(page.getByText("slow-one@example.test")).toBeVisible();

    const lowerMember = page.getByRole("row").filter({ hasText: "slow-two@example.test" });
    await lowerMember.scrollIntoViewIfNeeded();
    await expect(lowerMember).toBeInViewport();
    await lowerMember.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(lowerMember.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  } finally {
    releaseAvatar();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("unavailable external fonts do not block member controls", async ({ page }) => {
  let releaseFonts!: () => void;
  const fontsPending = new Promise<void>(resolve => { releaseFonts = resolve; });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, async route => {
    await fontsPending;
    await route.abort();
  });

  try {
    await page.goto("/dashboard/admin/members", { waitUntil: "commit" });
    await page.waitForLoadState("load", { timeout: 3_000 });
    const row = page.getByRole("row").filter({ hasText: "playwright@localhost" });
    await row.scrollIntoViewIfNeeded();
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(row.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  } finally {
    releaseFonts();
    await page.unrouteAll({ behavior: "wait" });
  }
});
