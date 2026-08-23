import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.polls";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

describe("api.polls action security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects poll creation for non-admin users", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 42,
      is_admin: 0,
      status: "active",
      email: "member@example.com",
    } as any);

    const formData = new FormData();
    formData.set("_action", "create");
    formData.set("title", "Q2 Poll");

    const request = new Request("http://localhost/api/polls", {
      method: "POST",
      body: formData,
    });

    const db = {
      prepare: vi.fn(),
    };

    const response = await action({
      request,
      context: createLoadContext({ env: { DB: db } } as never),
    } as any);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Only admins can create polls" });
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
