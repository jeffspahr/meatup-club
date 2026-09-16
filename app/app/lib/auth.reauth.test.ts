// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "./router-context";
import { commitSession, getSession } from "./session.server";
import { getUser, requireActiveUser } from "./auth.server";
import { forceUserReauth } from "./db.server";
import { loader as oauthCallback } from "../routes/auth.google.callback";

describe("durable forced reauthentication", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec("INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active'), (2, 'other@example.com', 'active')");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(
      url.includes("/token")
        ? { access_token: "test-token" }
        : { id: "google-member", email: "member@example.com", verified_email: true, name: "Member" }
    )));
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.unstubAllGlobals();
  });

  function context() {
    return createLoadContext({ env: { DB: harness.db } } as never);
  }

  async function legacyCookie(browser: string, userId = 1, email = "member@example.com") {
    const session = await getSession();
    session.set("userId", userId);
    session.set("email", email);
    session.set("oauth_state", browser);
    return (await commitSession(session)).split(";")[0];
  }

  function request(cookie: string) {
    return new Request("https://meatup.club/dashboard", { headers: { Cookie: cookie } });
  }

  async function signIn() {
    const response = await oauthCallback({
      request: new Request("https://meatup.club/auth/google/callback?code=test&state=fresh-state", {
        headers: { Cookie: await legacyCookie("fresh-state") },
      }),
      context: context(), params: {},
    } as never);
    expect(response.headers.get("Location")).toBe("/dashboard");
    return response.headers.get("Set-Cookie")!.split(";")[0];
  }

  it("does not revive untouched older cookies when another browser signs in again", async () => {
    const browserA = await legacyCookie("browser-a");
    const browserB = await legacyCookie("browser-b");
    expect(browserA).not.toBe(browserB);
    expect(await requireActiveUser(request(browserA), context())).toMatchObject({ id: 1 });
    expect(await requireActiveUser(request(browserB), context())).toMatchObject({ id: 1 });

    await forceUserReauth(harness.db, 1);
    await expect(requireActiveUser(request(browserA), context())).rejects.toMatchObject({ status: 302 });
    const freshCookie = await signIn();
    expect(harness.get("SELECT requires_reauth FROM users WHERE id = 1")).toEqual({ requires_reauth: 0 });
    expect(await getUser(request(browserB), context())).toBeNull();
    expect(await getUser(request(browserA), context())).toBeNull();
    expect(await requireActiveUser(request(freshCookie), context())).toMatchObject({ id: 1 });
    expect((await getSession(freshCookie)).get("sessionVersion")).toBe(1);

    await forceUserReauth(harness.db, 1);
    const nextCookie = await signIn();
    expect(await getUser(request(freshCookie), context())).toBeNull();
    expect(await requireActiveUser(request(nextCookie), context())).toMatchObject({ id: 1 });
    expect((await getSession(nextCookie)).get("sessionVersion")).toBe(2);
  });

  it("preserves unversioned sessions until their own account is forced to reauthenticate", async () => {
    const otherCookie = await legacyCookie("other-browser", 2, "other@example.com");
    await forceUserReauth(harness.db, 1);
    await signIn();
    expect(await requireActiveUser(request(otherCookie), context())).toMatchObject({ id: 2 });
  });

  it("migrates existing ordinary and already-revoked accounts without reviving old cookies", async () => {
    // Recreate the complete canonical schema before the additive version column.
    harness.sqlite.exec("ALTER TABLE users DROP COLUMN session_version");
    harness.sqlite.exec("UPDATE users SET requires_reauth = 1 WHERE id = 1");
    const revokedCookie = await legacyCookie("revoked-before-migration");
    const ordinaryCookie = await legacyCookie("ordinary-browser", 2, "other@example.com");
    harness.sqlite.exec(readFileSync(
      new URL("../../migrations/20260916_add_user_session_version.sql", import.meta.url), "utf8"
    ));
    expect(harness.all("SELECT id, session_version FROM users ORDER BY id")).toEqual([
      { id: 1, session_version: 1 },
      { id: 2, session_version: 0 },
    ]);
    const freshCookie = await signIn();
    expect(await getUser(request(revokedCookie), context())).toBeNull();
    expect(await requireActiveUser(request(freshCookie), context())).toMatchObject({ id: 1 });
    expect(await requireActiveUser(request(ordinaryCookie), context())).toMatchObject({ id: 2 });
  });
});
