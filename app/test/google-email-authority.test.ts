// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness, type SqliteD1Harness } from "./support/sqlite-d1";
import { createLoadContext } from "../app/lib/router-context";
import { commitSession, getSession } from "../app/lib/session.server";
import { requireActiveUser } from "../app/lib/auth.server";
import { loader } from "../app/routes/auth.google.callback";

describe("Google callback email authority", () => {
  let harness: SqliteD1Harness;
  beforeEach(() => { harness = createSqliteD1Harness(); });
  afterEach(() => {
    harness.sqlite.close();
    vi.unstubAllGlobals();
  });

  function seedMember(email: string) {
    return harness.insert(
      `INSERT INTO users(email, name, status, is_admin, requires_reauth, session_version)
       VALUES (?, 'Existing member', 'active', 1, 1, 7)`, email,
    );
  }

  function mockGoogle(claims: Record<string, unknown>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "dummy-token" });
      }
      if (String(input) === "https://www.googleapis.com/oauth2/v2/userinfo") {
        return Response.json({ id: "google-subject", name: "Provider profile", ...claims });
      }
      throw new Error("Unexpected provider request");
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function callbackRequest(state = "expected-state") {
    // This browser has only an OAuth state cookie, no member session.
    const session = await getSession();
    session.set("oauth_state", "expected-state");
    return new Request(`https://example.invalid/auth/google/callback?code=dummy-code&state=${state}`, {
      headers: { Cookie: (await commitSession(session)).split(";")[0] },
    });
  }

  it.each([
    { email: "member@example.test", verified_email: true },
    { email: "member@example.test", verified_email: true, hd: "" },
    { email: "member@example.test", verified_email: true, hd: "   " },
    { email: "member@example.test", verified_email: true, hd: 42 },
    { email: "member@example.test", verified_email: false, hd: "example.test" },
    { email: "member@gmail.com", verified_email: false },
    { email: "member@gmail.com" },
    { email: "member@gmail.com", verified_email: "true" },
    { email: "member@gmail.com", verified_email: 1 },
    { email: "", verified_email: true, hd: "example.test" },
    { email: "not-an-email", verified_email: true, hd: "example.test" },
    { email: null, verified_email: true, hd: "example.test" },
    { verified_email: true, hd: "example.test" },
  ])("rejects unsupported claims without modifying or authenticating a member: %j", async (claims) => {
    seedMember(typeof claims.email === "string" && claims.email.includes("@")
      ? claims.email : "member@example.test");
    mockGoogle(claims);
    const context = createLoadContext({ env: { DB: harness.db } } as never);
    let denial: unknown;
    try {
      await loader({ request: await callbackRequest(), context, params: {} } as never);
    } catch (error) { denial = error; }
    expect(denial).toBeInstanceOf(Response);
    expect((denial as Response).status).toBe(403);
    expect((denial as Response).headers.get("Set-Cookie")).toBeNull();
    expect(harness.all("SELECT name, requires_reauth, session_version FROM users"))
      .toEqual([{ name: "Existing member", requires_reauth: 1, session_version: 7 }]);
    expect(harness.all("SELECT user_id FROM activity_log")).toEqual([]);
  });

  it.each([
    { email: "member@gmail.com", verified_email: true },
    { email: "member@example.test", verified_email: true, hd: "example.test" },
  ])("authenticates an existing member with authoritative claims: %j", async (claims) => {
    const memberId = seedMember(claims.email);
    mockGoogle(claims);
    const context = createLoadContext({ env: { DB: harness.db } } as never);
    const response = await loader({ request: await callbackRequest(), context, params: {} } as never);
    expect(response.headers.get("Location")).toBe("/dashboard");
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    const session = await getSession(cookie);
    expect(session.get("userId")).toBe(memberId);
    expect(session.get("sessionVersion")).toBe(7);
    const user = await requireActiveUser(new Request("https://example.invalid/dashboard", {
      headers: { Cookie: cookie },
    }), context);
    expect(user).toMatchObject({ id: memberId, status: "active", is_admin: 1 });
    expect(harness.get("SELECT name, requires_reauth FROM users WHERE id = ?", memberId))
      .toEqual({ name: "Provider profile", requires_reauth: 0 });
    expect(harness.all("SELECT user_id, action_type FROM activity_log"))
      .toEqual([{ user_id: memberId, action_type: "login" }]);
  });

  it("rejects mismatched OAuth state before provider access or account changes", async () => {
    seedMember("member@gmail.com");
    const provider = mockGoogle({ email: "member@gmail.com", verified_email: true });
    await expect(loader({
      request: await callbackRequest("wrong-state"),
      context: createLoadContext({ env: { DB: harness.db } } as never), params: {},
    } as never)).rejects.toThrow("Invalid state parameter");
    expect(provider).not.toHaveBeenCalled();
    expect(harness.get("SELECT requires_reauth FROM users")).toEqual({ requires_reauth: 1 });
    expect(harness.all("SELECT user_id FROM activity_log")).toEqual([]);
  });
});
