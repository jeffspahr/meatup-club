import { describe, expect, it, vi } from "vitest";
import { ensureUser } from "./db.server";

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
      "INSERT INTO users (email, name, picture) VALUES (?, ?, ?)"
    );
  });
});
