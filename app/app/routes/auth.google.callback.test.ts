import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./auth.google.callback";
import { getSession } from "../lib/session.server";
import {
  createUserSession,
  getGoogleTokens,
  getGoogleUserInfo,
} from "../lib/auth.server";
import { ensureUser, getUserByEmail } from "../lib/db.server";
import { logActivity } from "../lib/activity.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/session.server", () => ({
  getSession: vi.fn(),
}));

vi.mock("../lib/auth.server", () => ({
  getGoogleTokens: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  createUserSession: vi.fn(),
}));

vi.mock("../lib/db.server", () => ({
  ensureUser: vi.fn(),
  getUserByEmail: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

function createSession(storedState: string | null) {
  return {
    get: vi.fn((key: string) => (key === "oauth_state" ? storedState : undefined)),
  };
}

function createCookieRequest(url: string, cookie: string = "__session=abc") {
  return {
    url,
    headers: {
      get: vi.fn((key: string) => (key === "Cookie" ? cookie : null)),
    },
  } as unknown as Request;
}

describe("auth.google.callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(createSession("expected-state") as never);
    vi.mocked(getGoogleTokens).mockResolvedValue({ access_token: "token-123" } as never);
    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      email: "member@example.com",
      verified_email: true,
      hd: "example.com",
      name: "Member",
      picture: "https://example.com/member.png",
    } as never);
    vi.mocked(ensureUser).mockResolvedValue(42 as never);
    vi.mocked(getUserByEmail).mockResolvedValue({ status: "active", session_version: 3 } as never);
    vi.mocked(logActivity).mockResolvedValue(undefined as never);
    vi.mocked(createUserSession).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      }) as never
    );
  });

  it("throws when the callback is missing required query parameters", async () => {
    await expect(
      loader({
        request: createCookieRequest("http://localhost/auth/google/callback?state=expected-state"),
        context: createLoadContext({ env: { DB: {} } } as never) as never,
        params: {},
      } as never)
    ).rejects.toThrow("Missing code or state parameter");
  });

  it("throws when the OAuth state does not match the session state", async () => {
    await expect(
      loader({
        request: createCookieRequest(
          "http://localhost/auth/google/callback?code=code-123&state=wrong-state"
        ),
        context: createLoadContext({ env: { DB: {} } } as never) as never,
        params: {},
      } as never)
    ).rejects.toThrow("Invalid state parameter");
  });

  it("creates an active-user session and logs the login activity", async () => {
    const request = createCookieRequest(
      "http://localhost/auth/google/callback?code=code-123&state=expected-state"
    );
    const db = { marker: true };

    const response = await loader({
      request,
      context: createLoadContext({ env: { DB: db } } as never) as never,
      params: {},
    } as never);

    expect(getSession).toHaveBeenCalledWith("__session=abc");
    expect(getGoogleTokens).toHaveBeenCalledWith(
      "code-123",
      "http://localhost/auth/google/callback"
    );
    expect(getGoogleUserInfo).toHaveBeenCalledWith("token-123");
    expect(ensureUser).toHaveBeenCalledWith(
      db,
      "member@example.com",
      "Member",
      "https://example.com/member.png"
    );
    expect(getUserByEmail).toHaveBeenCalledWith(db, "member@example.com");
    expect(logActivity).toHaveBeenCalledWith({
      db,
      userId: 42,
      actionType: "login",
      actionDetails: {
        email: "member@example.com",
        name: "Member",
        active: true,
      },
      route: "/auth/google/callback",
      request,
    });
    expect(createUserSession).toHaveBeenCalledWith(
      42,
      "member@example.com",
      "/dashboard",
      3
    );
    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it.each([
    { email: "member@example.com", verified_email: true },
    { email: "member@example.com", verified_email: true, hd: "" },
    { email: "member@example.com", verified_email: true, hd: "   " },
    { email: "member@example.com", verified_email: true, hd: 42 },
    { email: "member@gmail.com", verified_email: false },
    { email: "member@example.com", verified_email: false, hd: "example.com" },
    { email: "member@example.com", verified_email: false },
    { email: "member@example.com" },
    { email: "member@example.com", verified_email: "true" },
    { email: "member@example.com", verified_email: 1 },
    { verified_email: true },
    { email: null, verified_email: true },
    { email: 42, verified_email: true },
    { email: "", verified_email: true },
    { email: "   ", verified_email: true },
    { email: "not-an-email", verified_email: true },
    { email: "member@@example.com", verified_email: true },
    { email: " member@example.com", verified_email: true },
    null,
  ])("rejects invalid Google email claims before changing an account: %j", async (claims) => {
    vi.mocked(getGoogleUserInfo).mockResolvedValue(claims as never);

    await expect(loader({
      request: new Request(
        "http://localhost/auth/google/callback?code=code-123&state=expected-state"
      ),
      context: createLoadContext({ env: { DB: {} } } as never),
      params: {},
    } as never)).rejects.toMatchObject({ status: 403 });

    expect(ensureUser).not.toHaveBeenCalled();
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it("accepts a verified Gmail address without a hosted-domain claim", async () => {
    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: "google-subject", email: "member@gmail.com", verified_email: true, name: "Member",
    });
    await loader({
      request: new Request(
        "http://localhost/auth/google/callback?code=code-123&state=expected-state"
      ),
      context: createLoadContext({ env: { DB: {} } } as never),
      params: {},
    } as never);
    expect(ensureUser).toHaveBeenCalledWith(expect.anything(), "member@gmail.com", "Member", undefined);
    expect(createUserSession).toHaveBeenCalledWith(42, "member@gmail.com", "/dashboard", 3);
  });

  it("does not change an account when the Google userinfo request fails", async () => {
    vi.mocked(getGoogleUserInfo).mockRejectedValue(new Error("Provider unavailable"));

    await expect(loader({
      request: new Request(
        "http://localhost/auth/google/callback?code=code-123&state=expected-state"
      ),
      context: createLoadContext({ env: { DB: {} } } as never),
      params: {},
    } as never)).rejects.toThrow("Provider unavailable");

    expect(ensureUser).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it("redirects inactive users to the pending page", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ status: "pending", session_version: 3 } as never);
    vi.mocked(createUserSession).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/pending" },
      }) as never
    );

    const response = await loader({
      request: createCookieRequest(
        "http://localhost/auth/google/callback?code=code-123&state=expected-state"
      ),
      context: createLoadContext({ env: { DB: { marker: true } } } as never) as never,
      params: {},
    } as never);

    expect(createUserSession).toHaveBeenCalledWith(
      42,
      "member@example.com",
      "/pending",
      3
    );
    expect(response.headers.get("Location")).toBe("/pending");
  });
});
