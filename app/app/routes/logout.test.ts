import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./logout";
import { getUser, logout } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";

vi.mock("../lib/auth.server", () => ({
  getUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logout).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/" },
      }) as never
    );
  });

  it("logs the logout activity before redirecting from the loader", async () => {
    const request = new Request("http://localhost/logout");
    const db = { marker: true };
    vi.mocked(getUser).mockResolvedValue({
      id: 42,
      email: "member@example.com",
      status: "active",
    } as never);

    const response = await loader({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(logActivity).toHaveBeenCalledWith({
      db,
      userId: 42,
      actionType: "logout",
      route: "/logout",
      request,
    });
    expect(logout).toHaveBeenCalledWith(request);
    expect(response.headers.get("Location")).toBe("/");
  });

  it("logs the logout activity before redirecting from the action", async () => {
    const request = new Request("http://localhost/logout", { method: "POST" });
    const db = { marker: true };
    vi.mocked(getUser).mockResolvedValue({
      id: 7,
      email: "member@example.com",
      status: "active",
    } as never);

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(logActivity).toHaveBeenCalledWith({
      db,
      userId: 7,
      actionType: "logout",
      route: "/logout",
      request,
    });
    expect(logout).toHaveBeenCalledWith(request);
    expect(response.headers.get("Location")).toBe("/");
  });

  it("skips activity logging when there is no authenticated user", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    await action({
      request: new Request("http://localhost/logout", { method: "POST" }),
      context: { cloudflare: { env: { DB: { marker: true } } } } as never,
      params: {},
    } as never);

    expect(logActivity).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });
});
