import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUserSession,
  getUser,
  logout,
  requireActiveUser,
  requireAdmin,
  requireAuth,
  type AuthUser,
} from "./auth.server";
import { getUserByEmail } from "./db.server";
import {
  commitSession,
  destroySession,
  getSession,
} from "./session.server";

vi.mock("./db.server", () => ({
  getUserByEmail: vi.fn(),
  isUserActive: vi.fn(),
}));

vi.mock("./session.server", () => ({
  getSession: vi.fn(),
  commitSession: vi.fn(),
  destroySession: vi.fn(),
}));

const activeUser: AuthUser = {
  id: 7,
  email: "member@example.com",
  name: "Member",
  picture: null,
  is_admin: 0,
  status: "active",
  requires_reauth: 0,
  notify_comment_replies: 1,
  notify_poll_updates: 1,
  notify_event_updates: 1,
  phone_number: null,
  sms_opt_in: 0,
  sms_opt_out_at: null,
};

function createSession(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string) => values[key]),
    set: vi.fn(),
  };
}

function createContext() {
  return {
    cloudflare: {
      env: { DB: { prepare: vi.fn() } },
    },
  } as any;
}

async function expectRedirect(
  operation: Promise<unknown>,
  location: string
) {
  try {
    await operation;
    throw new Error("Expected redirect response to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(location);
    return response;
  }
}

describe("auth server authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without complete session identity", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createSession({ userId: 7 }) as any
    );

    const user = await getUser(
      new Request("http://localhost/dashboard"),
      createContext()
    );

    expect(user).toBeNull();
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("loads the current user from the database email in the session", async () => {
    const context = createContext();
    vi.mocked(getSession).mockResolvedValue(
      createSession({ userId: 7, email: activeUser.email }) as any
    );
    vi.mocked(getUserByEmail).mockResolvedValue(activeUser as any);

    await expect(
      getUser(new Request("http://localhost/dashboard"), context)
    ).resolves.toEqual(activeUser);
    expect(getUserByEmail).toHaveBeenCalledWith(
      context.cloudflare.env.DB,
      activeUser.email
    );
  });

  it("redirects unauthenticated requests to login", async () => {
    vi.mocked(getSession).mockResolvedValue(createSession() as any);

    await expectRedirect(
      requireAuth(
        new Request("http://localhost/dashboard"),
        createContext()
      ),
      "/login"
    );
  });

  it("destroys sessions for users marked for reauthentication", async () => {
    const session = createSession({
      userId: activeUser.id,
      email: activeUser.email,
    });
    vi.mocked(getSession).mockResolvedValue(session as any);
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...activeUser,
      requires_reauth: 1,
    } as any);
    vi.mocked(destroySession).mockResolvedValue("expired-session");

    await expectRedirect(
      requireAuth(
        { headers: { get: vi.fn(() => "__session=old") } } as any,
        createContext()
      ),
      "/"
    );

    expect(destroySession).toHaveBeenCalledWith(session);
  });

  it("redirects inactive users to the pending page", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createSession({ userId: 7, email: activeUser.email }) as any
    );
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...activeUser,
      status: "pending",
    } as any);

    await expectRedirect(
      requireActiveUser(
        new Request("http://localhost/dashboard"),
        createContext()
      ),
      "/pending"
    );
  });

  it("redirects active non-admins away from admin routes", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createSession({ userId: 7, email: activeUser.email }) as any
    );
    vi.mocked(getUserByEmail).mockResolvedValue(activeUser as any);

    await expectRedirect(
      requireAdmin(
        new Request("http://localhost/dashboard/admin"),
        createContext()
      ),
      "/dashboard"
    );
  });

  it("returns active administrators", async () => {
    const admin = { ...activeUser, is_admin: 1 };
    vi.mocked(getSession).mockResolvedValue(
      createSession({ userId: 7, email: activeUser.email }) as any
    );
    vi.mocked(getUserByEmail).mockResolvedValue(admin as any);

    await expect(
      requireAdmin(
        new Request("http://localhost/dashboard/admin"),
        createContext()
      )
    ).resolves.toEqual(admin);
  });
});

describe("auth server session responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session cookie before redirecting", async () => {
    const session = createSession();
    vi.mocked(getSession).mockResolvedValue(session as any);
    vi.mocked(commitSession).mockResolvedValue("new-session");

    const response = await createUserSession(
      activeUser.id,
      activeUser.email,
      "/dashboard"
    );

    expect(session.set).toHaveBeenCalledWith("userId", activeUser.id);
    expect(session.set).toHaveBeenCalledWith("email", activeUser.email);
    expect(commitSession).toHaveBeenCalledWith(session);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it("destroys the request session before redirecting home", async () => {
    const session = createSession();
    vi.mocked(getSession).mockResolvedValue(session as any);
    vi.mocked(destroySession).mockResolvedValue("expired-session");

    const response = await logout(
      { headers: { get: vi.fn(() => "__session=old") } } as any
    );

    expect(getSession).toHaveBeenCalledWith("__session=old");
    expect(destroySession).toHaveBeenCalledWith(session);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
  });
});
