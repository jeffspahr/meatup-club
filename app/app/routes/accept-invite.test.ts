import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./accept-invite";
import { getUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  getUser: vi.fn(),
}));

function createMockDb() {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => ({
    bind: (...bindArgs: unknown[]) => ({
      run: async () => {
        runCalls.push({ sql, bindArgs });
        return { meta: { changes: 1 } };
      },
    }),
  }));

  return { prepare, runCalls };
}

async function expectRedirectThrown(promise: Promise<unknown>, location: string) {
  try {
    await promise;
    throw new Error("Expected redirect to be thrown");
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

  it("redirects unauthenticated users to login from the loader", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    await expectRedirectThrown(
      loader({
        request: new Request("http://localhost/accept-invite"),
        context: { cloudflare: { env: {} } } as never,
        params: {},
      } as never),
      "/login"
    );
  });

  it("redirects already-active users to the dashboard from the loader", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 123,
      status: "active",
      email: "user@example.com",
    } as never);

    await expectRedirectThrown(
      loader({
        request: new Request("http://localhost/accept-invite"),
        context: { cloudflare: { env: {} } } as never,
        params: {},
      } as never),
      "/dashboard"
    );
  });

  it("returns invited users from the loader", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 123,
      status: "invited",
      email: "user@example.com",
    } as never);

    const result = await loader({
      request: new Request("http://localhost/accept-invite"),
      context: { cloudflare: { env: {} } } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      user: {
        id: 123,
        status: "invited",
        email: "user@example.com",
      },
    });
  });

  it("redirects unauthenticated users to login from the action", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    await expectRedirectThrown(
      action({
        request: new Request("http://localhost/accept-invite", { method: "POST" }),
        context: { cloudflare: { env: {} } } as never,
        params: {},
      } as never),
      "/login"
    );
  });

  it("rejects non-invited users in the action", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 123,
      status: "active",
      email: "user@example.com",
    } as never);
    const db = createMockDb();

    const result = await action({
      request: new Request("http://localhost/accept-invite", { method: "POST" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Only invited users can accept invitations" });
    expect(db.runCalls).toEqual([]);
  });

  it("activates invited users and redirects to the dashboard", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 123,
      status: "invited",
      email: "user@example.com",
    } as never);
    const db = createMockDb();

    const response = await action({
      request: new Request("http://localhost/accept-invite", { method: "POST" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard");
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE users SET status = ? WHERE id = ?",
        bindArgs: ["active", 123],
      },
    ]);
  });
});
