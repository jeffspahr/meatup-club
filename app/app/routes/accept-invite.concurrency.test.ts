// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { getUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./accept-invite";

vi.mock("../lib/auth.server", () => ({ getUser: vi.fn() }));

describe("invitation acceptance membership guard", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec("INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'invited')");
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.clearAllMocks();
  });

  function accept() {
    return action({
      request: new Request("https://meatup.club/accept-invite", { method: "POST" }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it("activates a still-invited account", async () => {
    vi.mocked(getUser).mockResolvedValue(harness.get("SELECT * FROM users WHERE id = 1") as never);
    const result = await accept();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/dashboard");
    expect(harness.get("SELECT status FROM users WHERE id = 1")).toEqual({ status: "active" });
  });

  it("does not reactivate an account deactivated after authentication", async () => {
    vi.mocked(getUser).mockImplementation(async () => {
      const authenticatedUser = harness.get("SELECT * FROM users WHERE id = 1");
      // Interleave the admin's removal after reading the authenticated account.
      harness.sqlite.exec("UPDATE users SET status = 'inactive', session_version = session_version + 1 WHERE id = 1");
      return authenticatedUser as never;
    });
    expect(await accept()).toEqual({ error: "Your invitation is no longer available. Please contact an admin." });
    expect(harness.get("SELECT status, session_version FROM users WHERE id = 1"))
      .toEqual({ status: "inactive", session_version: 1 });
  });
});
