// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness, type SqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "../lib/router-context";
import { commitSession, getSession } from "../lib/session.server";
import { requireActiveUser } from "../lib/auth.server";
import { loader as oauthCallback } from "./auth.google.callback";
import { action as inviteMember } from "./dashboard.admin.members";
import { action as acceptInvite } from "./accept-invite";

async function sessionCookie(values: { userId?: number; email?: string; oauth_state?: string }) {
  const session = await getSession();
  if (values.userId !== undefined) session.set("userId", values.userId);
  if (values.email !== undefined) session.set("email", values.email);
  if (values.oauth_state !== undefined) session.set("oauth_state", values.oauth_state);
  return (await commitSession(session)).split(";")[0];
}

describe("membership admission with the canonical schema", () => {
  let harness: SqliteD1Harness;

  beforeEach(() => {
    harness = createSqliteD1Harness();
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

  async function signIn() {
    return oauthCallback({
      request: new Request("https://meatup.club/auth/google/callback?code=test&state=test-state", {
        headers: { Cookie: await sessionCookie({ oauth_state: "test-state" }) },
      }),
      context: context(),
      params: {},
    } as never);
  }

  async function memberRequest(path: string, init: RequestInit = {}) {
    const member = harness.get<{ id: number }>("SELECT id FROM users WHERE email = ?", "member@example.com")!;
    return new Request(`https://meatup.club${path}`, {
      ...init,
      headers: { Cookie: await sessionCookie({ userId: member.id, email: "member@example.com" }) },
    });
  }

  it("keeps a first-time, uninvited Google user pending and blocks member access", async () => {
    const response = await signIn();
    expect(response.headers.get("Location")).toBe("/pending");
    expect(harness.get("SELECT status FROM users WHERE email = ?", "member@example.com"))
      .toEqual({ status: "pending" });
    await expect(requireActiveUser(await memberRequest("/dashboard"), context()))
      .rejects.toMatchObject({ status: 302, headers: expect.any(Headers) });
    const acceptance = await acceptInvite({
      request: await memberRequest("/accept-invite", { method: "POST" }),
      context: context(), params: {},
    } as never);
    expect(acceptance).toEqual({ error: "Only invited users can accept invitations" });
    expect(harness.get("SELECT status FROM users WHERE email = ?", "member@example.com"))
      .toEqual({ status: "pending" });
  });

  it("returns invited users to invitation acceptance after Google sign-in", async () => {
    harness.insert("INSERT INTO users (email, status) VALUES (?, 'invited')", "member@example.com");
    const response = await signIn();
    expect(response.headers.get("Location")).toBe("/accept-invite");
    expect(harness.get("SELECT status FROM users WHERE email = ?", "member@example.com"))
      .toEqual({ status: "invited" });

    const acceptance = await acceptInvite({
      request: await memberRequest("/accept-invite", { method: "POST" }),
      context: context(), params: {},
    } as never);
    expect(acceptance).toBeInstanceOf(Response);
    expect((acceptance as Response).headers.get("Location")).toBe("/dashboard");
    expect(await requireActiveUser(await memberRequest("/dashboard"), context()))
      .toMatchObject({ status: "active" });
  });

  it("allows an admin to invite an existing pending account without creating a duplicate", async () => {
    const memberId = harness.insert("INSERT INTO users (email, status) VALUES (?, 'pending')", "member@example.com");
    const adminId = harness.insert("INSERT INTO users (email, status, is_admin) VALUES (?, 'active', 1)", "admin@example.com");
    const response = await inviteMember({
      request: new Request("https://meatup.club/dashboard/admin/members", {
        method: "POST",
        headers: { Cookie: await sessionCookie({ userId: adminId, email: "admin@example.com" }) },
        body: new URLSearchParams({ _action: "invite", email: "member@example.com", name: "Invited Member" }),
      }),
      context: context(), params: {},
    } as never);
    expect(response).toBeInstanceOf(Response);
    expect(harness.get("SELECT id, status FROM users WHERE email = ?", "member@example.com"))
      .toEqual({ id: memberId, status: "invited" });
    expect((await signIn()).headers.get("Location")).toBe("/accept-invite");
  });

  it("preserves active membership on subsequent Google sign-ins", async () => {
    harness.insert("INSERT INTO users (email, status) VALUES (?, 'active')", "member@example.com");
    expect((await signIn()).headers.get("Location")).toBe("/dashboard");
    expect(await requireActiveUser(await memberRequest("/dashboard"), context()))
      .toMatchObject({ status: "active" });
  });
});
