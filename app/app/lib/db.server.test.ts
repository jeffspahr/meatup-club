import { describe, expect, it, vi } from "vitest";
import {
  ensureUser,
  forceUserReauth,
  getUserByEmail,
  isUserActive,
} from "./db.server";

function createMockDb({
  existingUserId,
}: {
  existingUserId: number | null;
}) {
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => {
        if (sql === "SELECT id FROM users WHERE email = ?") {
          return existingUserId ? { id: existingUserId } : null;
        }
        return null;
      },
      run: async () => ({
        meta: {
          last_row_id: 777,
        },
        sql,
        args,
      }),
    }),
  }));

  return { prepare };
}

describe("ensureUser", () => {
  it("updates profile fields without auto-activating existing users", async () => {
    const db = createMockDb({ existingUserId: 42 });

    const userId = await ensureUser(db, "user@example.com", "User Name", "https://img");

    expect(userId).toBe(42);
    expect(db.prepare).toHaveBeenCalledWith(
      "UPDATE users SET name = ?, picture = ?, requires_reauth = 0 WHERE id = ?"
    );
    expect(db.prepare).not.toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'")
    );
  });

  it("inserts a new user when no existing record is found", async () => {
    const db = createMockDb({ existingUserId: null });

    const userId = await ensureUser(db, "new@example.com", "New User", undefined);

    expect(userId).toBe(777);
    expect(db.prepare).toHaveBeenCalledWith(
      "INSERT INTO users (email, name, picture, status) VALUES (?, ?, ?, 'pending')"
    );
  });
});

describe("db.server helpers", () => {
  it("returns a full user record when looking up by email", async () => {
    const user = {
      id: 7,
      email: "user@example.com",
      status: "active",
    };
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            expect(sql).toBe("SELECT * FROM users WHERE email = ?");
            expect(args).toEqual(["user@example.com"]);
            return user;
          },
        }),
      })),
    };

    await expect(getUserByEmail(db as never, "user@example.com")).resolves.toEqual(user);
  });

  it("reports whether a looked-up user is active", async () => {
    const activeDb = {
      prepare: vi.fn(() => ({
        bind: () => ({
          first: async () => ({ id: 1, status: "active" }),
        }),
      })),
    };
    const inactiveDb = {
      prepare: vi.fn(() => ({
        bind: () => ({
          first: async () => ({ id: 2, status: "invited" }),
        }),
      })),
    };

    await expect(isUserActive(activeDb as never, "active@example.com")).resolves.toBe(true);
    await expect(isUserActive(inactiveDb as never, "inactive@example.com")).resolves.toBe(false);
  });

  it("forces reauthentication for a user ID", async () => {
    const run = vi.fn(async () => ({ meta: { changes: 1 } }));
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            expect(sql).toBe("UPDATE users SET requires_reauth = 1 WHERE id = ?");
            expect(args).toEqual([42]);
            return run();
          },
        }),
      })),
    };

    await forceUserReauth(db as never, 42);

    expect(run).toHaveBeenCalledTimes(1);
  });
});
