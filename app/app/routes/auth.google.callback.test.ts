import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./auth.google.callback";
import { getSession } from "../lib/session.server";
import {
  createUserSession,
  getGoogleTokens,
  getGoogleUserInfo,
} from "../lib/auth.server";
import { ensureUser, isUserActive } from "../lib/db.server";
import { logActivity } from "../lib/activity.server";

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
  isUserActive: vi.fn(),
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
      name: "Member",
      picture: "https://example.com/member.png",
    } as never);
    vi.mocked(ensureUser).mockResolvedValue(42 as never);
    vi.mocked(isUserActive).mockResolvedValue(true as never);
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
        context: { cloudflare: { env: { DB: {} } } } as never,
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
        context: { cloudflare: { env: { DB: {} } } } as never,
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
      context: { cloudflare: { env: { DB: db } } } as never,
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
    expect(isUserActive).toHaveBeenCalledWith(db, "member@example.com");
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
      "/dashboard"
    );
    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it("redirects inactive users to the pending page", async () => {
    vi.mocked(isUserActive).mockResolvedValue(false as never);
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
      context: { cloudflare: { env: { DB: { marker: true } } } } as never,
      params: {},
    } as never);

    expect(createUserSession).toHaveBeenCalledWith(
      42,
      "member@example.com",
      "/pending"
    );
    expect(response.headers.get("Location")).toBe("/pending");
  });
});
