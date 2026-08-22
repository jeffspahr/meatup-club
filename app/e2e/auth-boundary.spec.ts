import { expect, test } from "@playwright/test";

test("a protected page hands off to Google OAuth with callback and CSRF state", async ({
  context,
  page,
}) => {
  // The bypass only accepts the literal localhost hostname. Using 127.0.0.1
  // exercises the unauthenticated boundary against the same local server.
  const dashboardResponse = await page.request.get("http://127.0.0.1:4173/dashboard", {
    maxRedirects: 0,
  });
  expect(dashboardResponse.status()).toBe(302);
  expect(dashboardResponse.headers().location).toBe("/login");

  // Stop at the OAuth redirect so the test never contacts Google.
  const loginResponse = await page.request.get("http://127.0.0.1:4173/login", {
    maxRedirects: 0,
  });
  expect(loginResponse.status()).toBe(302);
  const oauthRequestUrl = new URL(loginResponse.headers().location);
  expect(oauthRequestUrl.origin).toBe("https://accounts.google.com");
  expect(oauthRequestUrl.pathname).toBe("/o/oauth2/v2/auth");
  expect(oauthRequestUrl.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:4173/auth/google/callback"
  );
  expect(oauthRequestUrl.searchParams.get("response_type")).toBe("code");
  expect(oauthRequestUrl.searchParams.get("scope")).toBe("openid email profile");
  expect(oauthRequestUrl.searchParams.get("state")).toMatch(/^[0-9a-f-]{36}$/i);

  const cookies = await context.cookies("http://127.0.0.1:4173");
  expect(cookies.some((cookie) => cookie.name === "__session" && cookie.httpOnly)).toBe(true);
});
