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
    harness.sqlite.exec("DELETE FROM email_templates");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(
      url.includes("api.resend.com") ? { id: "invite-message" } : url.includes("/token")
        ? { access_token: "test-token" }
        : { id: "google-member", email: "member@example.com", verified_email: true, name: "Member" }
    )));
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.unstubAllGlobals();
  });

  function context(resendApiKey?: string) {
    return createLoadContext({ env: { DB: harness.db, RESEND_API_KEY: resendApiKey } } as never);
  }

  async function sendInvitation(email: string, options: { templateId?: string; resendApiKey?: string } = {}) {
    const admin = harness.get<{ id: number }>("SELECT id FROM users WHERE email = 'admin@example.com'");
    const adminId = admin?.id ?? harness.insert("INSERT INTO users (email, status, is_admin) VALUES (?, 'active', 1)", "admin@example.com");
    return inviteMember({
      request: new Request("https://meatup.club/dashboard/admin/members", {
        method: "POST",
        headers: { Cookie: await sessionCookie({ userId: adminId, email: "admin@example.com" }) },
        body: new URLSearchParams({ _action: "invite", email, name: "Invited Member", template_id: options.templateId ?? "" }),
      }),
      context: context(options.resendApiKey), params: {},
    } as never);
  }

  it.each([
    ["new", "default"], ["pending", "default"],
    ["new", "selected"], ["pending", "selected"],
  ])("does not mutate a %s account when its %s template is missing, and permits retry", async (account, template) => {
    if (account === "pending") {
      harness.insert("INSERT INTO users (email, status, name) VALUES (?, 'pending', 'Original name')", "member@example.com");
    }
    const before = harness.get("SELECT id, status, name FROM users WHERE email = 'member@example.com'");
    const options = { resendApiKey: "synthetic-invitation-key", templateId: template === "selected" ? "999" : undefined };
    expect(await sendInvitation("member@example.com", options)).toEqual({ error: "Email template not found" });
    expect(harness.get("SELECT id, status, name FROM users WHERE email = 'member@example.com'")).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();

    harness.insert(`INSERT INTO email_templates (id, name, subject, html_body, text_body, is_default)
      VALUES (999, 'Invitation', 'Welcome', '<p>Welcome</p>', 'Welcome', 1)`);
    expect(await sendInvitation("member@example.com", options)).toBeInstanceOf(Response);
    expect(harness.get("SELECT status FROM users WHERE email = 'member@example.com'")).toEqual({ status: "invited" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["new", "pending"])("normalizes the invitation address for a %s Google account", async (account) => {
    if (account === "pending") {
      harness.insert("INSERT INTO users (email, status) VALUES (?, 'pending')", "member@example.com");
    }
    // No provider key or template is required when email sending is disabled.
    expect(await sendInvitation("  Member@Example.COM  ")).toBeInstanceOf(Response);
    expect(harness.all("SELECT email, status FROM users WHERE email != 'admin@example.com'"))
      .toEqual([{ email: "member@example.com", status: "invited" }]);
    expect((await signIn()).headers.get("Location")).toBe("/accept-invite");
  });

  it("sends invitation email and links using the normalized address", async () => {
    harness.insert(`INSERT INTO email_templates (name, subject, html_body, text_body, is_default)
      VALUES ('Invitation', 'Welcome', '{{acceptLink}}', '{{acceptLink}}', 1)`);
    expect(await sendInvitation("  Member@Example.COM  ", { resendApiKey: "synthetic-invitation-key" }))
      .toBeInstanceOf(Response);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.to).toEqual(["member@example.com"]);
    expect(payload.html).toContain("email=member%40example.com");
  });

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
