import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUserSession,
  getGoogleAuthUrl,
  getGoogleTokens,
  getGoogleUserInfo,
  getUser,
  logout,
  requireActiveUser,
  requireAdmin,
  requireAuth,
} from "./auth.server";
import { commitSession, destroySession, getSession } from "./session.server";
import { getUserByEmail } from "./db.server";

vi.mock("./session.server", () => ({
  getSession: vi.fn(),
  commitSession: vi.fn(),
  destroySession: vi.fn(),
}));

vi.mock("./db.server", () => ({
  getUserByEmail: vi.fn(),
}));

const originalNodeEnv = process.env.NODE_ENV;

type SessionValues = {
  userId?: number;
  email?: string;
};

function createMockSession(values: SessionValues = {}) {
  return {
    get: vi.fn((key: string) => values[key as keyof SessionValues]),
    set: vi.fn(),
  };
}

const baseUser = {
  id: 7,
  email: "member@example.com",
  name: "Member",
  picture: null,
  is_admin: 0,
  status: "active",
  requires_reauth: 0,
  notify_poll_updates: 1,
  notify_event_updates: 1,
  phone_number: null,
  sms_opt_in: 0,
  sms_opt_out_at: null,
};

const baseContext: {
  cloudflare: {
    env: {
      DB: {
        marker: string;
      };
      DEV_AUTH_BYPASS_EMAIL?: string;
    };
  };
} = {
  cloudflare: {
    env: {
      DB: { marker: "db" },
    },
  },
};

function createCookieRequest(url: string) {
  return {
    headers: {
      get: vi.fn((key: string) => (key === "Cookie" ? "__session=abc" : null)),
    },
    url,
  } as unknown as Request;
}

async function expectRedirectThrown(promise: Promise<unknown>, location: string) {
  try {
    await promise;
    throw new Error("Expected redirect to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(location);
    return response;
  }
}

describe("auth.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("returns null when the session does not contain an authenticated user", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);

    const user = await getUser(
      createCookieRequest("http://localhost/dashboard"),
      baseContext as never
    );

    expect(user).toBeNull();
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("loads the current user from the database when session credentials exist", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createMockSession({ userId: 7, email: "member@example.com" }) as never
    );
    vi.mocked(getUserByEmail).mockResolvedValue(baseUser as never);

    const user = await getUser(
      createCookieRequest("http://localhost/dashboard"),
      baseContext as never
    );

    expect(getSession).toHaveBeenCalledWith("__session=abc");
    expect(getUserByEmail).toHaveBeenCalledWith(
      baseContext.cloudflare.env.DB,
      "member@example.com"
    );
    expect(user).toEqual(baseUser);
  });

  it("does not use the local auth bypass when the bypass email is unset", async () => {
    process.env.NODE_ENV = "development";
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);

    const user = await getUser(
      createCookieRequest("http://localhost/dashboard"),
      baseContext as never
    );

    expect(user).toBeNull();
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledWith("__session=abc");
  });

  it("does not use the local auth bypass in tests", async () => {
    process.env.NODE_ENV = "test";
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);

    const user = await getUser(
      createCookieRequest("http://localhost/dashboard"),
      {
        cloudflare: {
          env: {
            ...baseContext.cloudflare.env,
            DEV_AUTH_BYPASS_EMAIL: "dev@localhost",
          },
        },
      } as never
    );

    expect(user).toBeNull();
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledWith("__session=abc");
  });

  it("loads a local auth bypass user from the database on localhost", async () => {
    process.env.NODE_ENV = "development";
    const devUser = {
      ...baseUser,
      id: 1,
      email: "dev@localhost",
      name: "Local Dev",
      is_admin: 1,
    };
    vi.mocked(getUserByEmail).mockResolvedValue(devUser as never);

    const user = await getUser(
      createCookieRequest("http://localhost/dashboard"),
      {
        cloudflare: {
          env: {
            ...baseContext.cloudflare.env,
            DEV_AUTH_BYPASS_EMAIL: " dev@localhost ",
          },
        },
      } as never
    );

    expect(user).toEqual(devUser);
    expect(getUserByEmail).toHaveBeenCalledWith(
      baseContext.cloudflare.env.DB,
      "dev@localhost"
    );
    expect(getSession).not.toHaveBeenCalled();
  });

  it("falls through to normal auth when the local auth bypass user is missing", async () => {
    process.env.NODE_ENV = "development";
    vi.mocked(getUserByEmail).mockResolvedValue(null as never);
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);

    const user = await getUser(
      createCookieRequest("http://localhost/dashboard"),
      {
        cloudflare: {
          env: {
            ...baseContext.cloudflare.env,
            DEV_AUTH_BYPASS_EMAIL: "dev@localhost",
          },
        },
      } as never
    );

    expect(user).toBeNull();
    expect(getUserByEmail).toHaveBeenCalledWith(
      baseContext.cloudflare.env.DB,
      "dev@localhost"
    );
    expect(getSession).toHaveBeenCalledWith("__session=abc");
  });

  it("does not use the local auth bypass outside localhost", async () => {
    process.env.NODE_ENV = "development";
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);

    const user = await getUser(
      createCookieRequest("https://meatup.club/dashboard"),
      {
        cloudflare: {
          env: {
            ...baseContext.cloudflare.env,
            DEV_AUTH_BYPASS_EMAIL: "dev@localhost",
          },
        },
      } as never
    );

    expect(user).toBeNull();
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledWith("__session=abc");
  });

  it("redirects unauthenticated requests to login", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);

    await expectRedirectThrown(
      requireAuth(new Request("http://localhost/dashboard"), baseContext as never),
      "/login"
    );
  });

  it("forces reauthentication when the current user requires it", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createMockSession({ userId: 7, email: "member@example.com" }) as never
    );
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...baseUser,
      requires_reauth: 1,
    } as never);
    vi.mocked(destroySession).mockResolvedValue("expired=true" as never);

    const response = await expectRedirectThrown(
      requireAuth(new Request("http://localhost/dashboard"), baseContext as never),
      "/"
    );

    expect(destroySession).toHaveBeenCalled();
  });

  it("redirects inactive users to the pending page", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createMockSession({ userId: 7, email: "member@example.com" }) as never
    );
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...baseUser,
      status: "invited",
    } as never);

    await expectRedirectThrown(
      requireActiveUser(new Request("http://localhost/dashboard"), baseContext as never),
      "/pending"
    );
  });

  it("redirects non-admin users back to the dashboard", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createMockSession({ userId: 7, email: "member@example.com" }) as never
    );
    vi.mocked(getUserByEmail).mockResolvedValue(baseUser as never);

    await expectRedirectThrown(
      requireAdmin(new Request("http://localhost/dashboard/admin"), baseContext as never),
      "/dashboard"
    );
  });

  it("creates a session cookie and redirects to the requested location", async () => {
    const session = createMockSession();
    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(commitSession).mockResolvedValue("__session=new" as never);

    const response = await createUserSession(12, "new@example.com", "/dashboard");

    expect(session.set).toHaveBeenNthCalledWith(1, "userId", 12);
    expect(session.set).toHaveBeenNthCalledWith(2, "email", "new@example.com");
    expect(commitSession).toHaveBeenCalledWith(session);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it("destroys the current session and redirects to the homepage", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession() as never);
    vi.mocked(destroySession).mockResolvedValue("__session=deleted" as never);

    const response = await logout(createCookieRequest("http://localhost/logout"));

    expect(getSession).toHaveBeenCalledWith("__session=abc");
    expect(destroySession).toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
  });

  it("builds the Google OAuth URL from env config and inputs", () => {
    const url = new URL(
      getGoogleAuthUrl("http://localhost/auth/google/callback", "state-123")
    );

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost/auth/google/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges an auth code for Google tokens and returns the JSON payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "access-123", refresh_token: "refresh-456" }),
    } as never);

    const tokens = await getGoogleTokens(
      "auth-code",
      "http://localhost/auth/google/callback"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
    expect(tokens).toEqual({
      access_token: "access-123",
      refresh_token: "refresh-456",
    });
  });

  it("throws when Google token exchange fails", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as never);

    await expect(
      getGoogleTokens("bad-code", "http://localhost/auth/google/callback")
    ).rejects.toThrow("Failed to exchange code for tokens");
  });

  it("loads Google user info with a bearer token and returns the JSON payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ email: "member@example.com", name: "Member" }),
    } as never);

    const user = await getGoogleUserInfo("access-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: "Bearer access-123",
        },
      }
    );
    expect(user).toEqual({ email: "member@example.com", name: "Member" });
  });

  it("throws when Google user info cannot be fetched", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as never);

    await expect(getGoogleUserInfo("access-123")).rejects.toThrow(
      "Failed to get user info"
    );
  });
});
