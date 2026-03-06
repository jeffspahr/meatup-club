import { describe, expect, it, vi } from "vitest";
import {
  createComment,
  deleteComment,
  getCommentCount,
  getComments,
} from "./comments.server";

describe("comments.server", () => {
  it("organizes flat comments into threaded roots and replies", async () => {
    const all = vi.fn(async () => ({
      results: [
        { id: 1, parent_id: null, content: "Root comment" },
        { id: 2, parent_id: 1, content: "Reply comment" },
        { id: 3, parent_id: 999, content: "Orphan reply" },
      ],
    }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare };

    const result = await getComments(db as never, "poll", 7);

    expect(result).toEqual([
      {
        id: 1,
        parent_id: null,
        content: "Root comment",
        replies: [{ id: 2, parent_id: 1, content: "Reply comment", replies: [] }],
      },
      {
        id: 3,
        parent_id: 999,
        content: "Orphan reply",
        replies: [],
      },
    ]);
  });

  it("creates comments with a nullable parent id", async () => {
    const run = vi.fn(async () => ({ meta: { changes: 1 } }));
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare };

    await createComment(db as never, 123, "poll", 7, "Top-level comment");
    await createComment(db as never, 123, "poll", 7, "Reply", 5);

    expect(bind).toHaveBeenNthCalledWith(1, 123, "poll", 7, "Top-level comment", null);
    expect(bind).toHaveBeenNthCalledWith(2, 123, "poll", 7, "Reply", 5);
  });

  it("rejects comment deletion for non-admin users who do not own the comment", async () => {
    const first = vi.fn(async () => ({ user_id: 999 }));
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        first,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }));
    const db = { prepare };

    const result = await deleteComment(db as never, 10, 123, false);

    expect(result).toBe(false);
    expect(prepare).toHaveBeenCalledWith("SELECT user_id FROM comments WHERE id = ?");
  });

  it("recursively deletes nested replies for owned comments", async () => {
    const deletedIds: number[] = [];
    const replyMap = new Map<number, Array<{ id: number }>>([
      [10, [{ id: 11 }, { id: 12 }]],
      [11, [{ id: 13 }]],
      [12, []],
      [13, []],
    ]);
    const prepare = vi.fn((sql: string) => ({
      bind: (value: number) => ({
        first: async () => ({ user_id: 123 }),
        all: async () => ({ results: replyMap.get(value) ?? [] }),
        run: async () => {
          if (sql === "DELETE FROM comments WHERE id = ?") {
            deletedIds.push(value);
          }
          return { meta: { changes: 1 } };
        },
      }),
    }));
    const db = { prepare };

    const result = await deleteComment(db as never, 10, 123, false);

    expect(result).toBe(true);
    expect(deletedIds).toEqual([13, 11, 12, 10]);
  });

  it("lets admins delete comments without checking ownership first", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        first: async () => ({ user_id: 999 }),
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }));
    const db = { prepare };

    const result = await deleteComment(db as never, 10, 123, true);

    expect(result).toBe(true);
    expect(prepare).not.toHaveBeenCalledWith("SELECT user_id FROM comments WHERE id = ?");
  });

  it("returns comment counts and falls back to zero", async () => {
    const first = vi.fn()
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce(null);
    const prepare = vi.fn(() => ({
      bind: () => ({ first }),
    }));
    const db = { prepare };

    await expect(getCommentCount(db as never, "poll", 7)).resolves.toBe(4);
    await expect(getCommentCount(db as never, "event", 9)).resolves.toBe(0);
  });
});
