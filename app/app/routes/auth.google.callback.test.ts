import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./auth.google.callback";
import {
  createUserSession,
  getGoogleTokens,
  getGoogleUserInfo,
} from "../lib/auth.server";
import { ensureUser, isUserActive } from "../lib/db.server";
import { getSession } from "../lib/session.server";
import { logActivity } from "../lib/activity.server";

vi.mock("../lib/session.server", () => ({
  getSession: vi.fn(),
}));

vi.mock("../lib/auth.server", () => ({
  createUserSession: vi.fn(),
  getGoogleTokens: vi.fn(),
  getGoogleUserInfo: vi.fn(),
}));

vi.mock("../lib/db.server", () => ({
  ensureUser: vi.fn(),
  isUserActive: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

function createContext() {
  return {
    cloudflare: {
      env: { DB: { prepare: vi.fn() } },
    },
  } as any;
}

describe("Google OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      get: vi.fn(() => "expected-state"),
    } as any);
    vi.mocked(getGoogleTokens).mockResolvedValue({
      access_token: "access-token",
    } as any);
    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      email: "member@example.com",
      name: "Member",
      picture: "https://example.com/member.jpg",
    } as any);
    vi.mocked(ensureUser).mockResolvedValue(17);
    vi.mocked(isUserActive).mockResolvedValue(true);
    vi.mocked(logActivity).mockResolvedValue(undefined);
    vi.mocked(createUserSession).mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "/dashboard" } })
    );
  });

  it("rejects callbacks missing the authorization code or state", async () => {
    await expect(
      loader({
        request: new Request("https://meatup.club/auth/google/callback?state=expected-state"),
        context: createContext(),
      } as any)
    ).rejects.toThrow("Missing code or state parameter");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a state value that does not match the session", async () => {
    await expect(
      loader({
        request: new Request(
          "https://meatup.club/auth/google/callback?code=code-123&state=wrong-state",
          { headers: { Cookie: "__session=oauth" } }
        ),
        context: createContext(),
      } as any)
    ).rejects.toThrow("Invalid state parameter");
    expect(getGoogleTokens).not.toHaveBeenCalled();
  });

  it("creates an active member session after a valid callback", async () => {
    const context = createContext();
    const request = new Request(
      "https://meatup.club/auth/google/callback?code=code-123&state=expected-state"
    );

    const response = await loader({ request, context } as any);

    expect(getGoogleTokens).toHaveBeenCalledWith(
      "code-123",
      "https://meatup.club/auth/google/callback"
    );
    expect(ensureUser).toHaveBeenCalledWith(
      context.cloudflare.env.DB,
      "member@example.com",
      "Member",
      "https://example.com/member.jpg"
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        db: context.cloudflare.env.DB,
        userId: 17,
        actionType: "login",
        route: "/auth/google/callback",
      })
    );
    expect(createUserSession).toHaveBeenCalledWith(
      17,
      "member@example.com",
      "/dashboard"
    );
    expect(response).toBeInstanceOf(Response);
  });

  it("sends inactive users to pending after establishing their session", async () => {
    vi.mocked(isUserActive).mockResolvedValue(false);
    vi.mocked(createUserSession).mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "/pending" } })
    );

    await loader({
      request: new Request(
        "https://meatup.club/auth/google/callback?code=code-123&state=expected-state"
      ),
      context: createContext(),
    } as any);

    expect(createUserSession).toHaveBeenCalledWith(
      17,
      "member@example.com",
      "/pending"
    );
  });
});
