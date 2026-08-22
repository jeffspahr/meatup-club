import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./accept-invite";
import { getUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  getUser: vi.fn(),
}));

const request = new Request("http://localhost/accept-invite");

function createContext(db: unknown = {}) {
  return {
    cloudflare: {
      env: { DB: db },
    },
  } as any;
}

async function expectRedirect(
  operation: Promise<unknown>,
  location: string
) {
  try {
    await operation;
    throw new Error(`Expected redirect to ${location}`);
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(302);
    expect((error as Response).headers.get("Location")).toBe(location);
  }
}

describe("accept-invite route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated visitors to login", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    await expectRedirect(
      loader({ request, context: createContext(), params: {} } as any),
      "/login"
    );
  });

  it("redirects active users away from the invitation screen", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 7,
      status: "active",
    } as any);

    await expectRedirect(
      loader({ request, context: createContext(), params: {} } as any),
      "/dashboard"
    );
  });

  it("returns invited users to the invitation screen", async () => {
    const user = { id: 7, status: "invited", email: "guest@example.com" };
    vi.mocked(getUser).mockResolvedValue(user as any);

    await expect(
      loader({ request, context: createContext(), params: {} } as any)
    ).resolves.toEqual({ user });
  });

  it("rejects acceptance when the authenticated user is not invited", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 7, status: "pending" } as any);
    const prepare = vi.fn();

    const result = await action({
      request: new Request(request, { method: "POST" }),
      context: createContext({ prepare }),
      params: {},
    } as any);

    expect(result).toEqual({
      error: "Only invited users can accept invitations",
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("persists invited status as active before redirecting", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 7, status: "invited" } as any);
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));

    const response = await action({
      request: new Request(request, { method: "POST" }),
      context: createContext({ prepare }),
      params: {},
    } as any);

    expect(prepare).toHaveBeenCalledWith(
      "UPDATE users SET status = ? WHERE id = ?"
    );
    expect(bind).toHaveBeenCalledWith("active", 7);
    expect(run).toHaveBeenCalledTimes(1);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard");
  });

  it("does not redirect when the status update fails", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 7, status: "invited" } as any);
    const persistenceError = new Error("D1 unavailable");
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockRejectedValue(persistenceError),
        })),
      })),
    };

    await expect(
      action({
        request: new Request(request, { method: "POST" }),
        context: createContext(db),
        params: {},
      } as any)
    ).rejects.toBe(persistenceError);
  });
});
