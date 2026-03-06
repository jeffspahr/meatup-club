import { describe, expect, it, vi } from "vitest";
import {
  createRestaurant,
  deleteRestaurant,
  findRestaurantByName,
  findRestaurantByPlaceId,
  getRestaurantsForPoll,
  getUserVote,
  removeVote,
  voteForRestaurant,
} from "./restaurants.server";

describe("restaurants.server", () => {
  it("loads restaurants for a poll with user vote state when a user id is provided", async () => {
    const all = vi.fn(async () => ({ results: [{ id: 1, name: "Prime Steakhouse" }] }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn((sql: string) => ({ bind }));
    const db = { prepare };

    const result = await getRestaurantsForPoll(db, 7, 123);

    expect(result).toEqual([{ id: 1, name: "Prime Steakhouse" }]);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("user_id = ?"));
    expect(bind).toHaveBeenCalledWith(7, 7, 123, 7);
  });

  it("loads restaurants for a poll without user vote state when no user id is provided", async () => {
    const all = vi.fn(async () => ({ results: [] }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn((sql: string) => ({ bind }));
    const db = { prepare };

    const result = await getRestaurantsForPoll(db, 7);

    expect(result).toEqual([]);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("0 as user_has_voted"));
    expect(bind).toHaveBeenCalledWith(7, 7);
  });

  it("finds restaurants by place id and by case-insensitive name", async () => {
    const first = vi
      .fn()
      .mockResolvedValueOnce({ id: 9, google_place_id: "place-123" })
      .mockResolvedValueOnce({ id: 10, name: "Prime Steakhouse" });
    const bind = vi.fn(() => ({ first }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare };

    await expect(findRestaurantByPlaceId(db, "place-123")).resolves.toEqual({
      id: 9,
      google_place_id: "place-123",
    });
    await expect(findRestaurantByName(db, "prime steakhouse")).resolves.toEqual({
      id: 10,
      name: "Prime Steakhouse",
    });
    expect(prepare).toHaveBeenNthCalledWith(1, "SELECT * FROM restaurants WHERE google_place_id = ?");
    expect(prepare).toHaveBeenNthCalledWith(2, "SELECT * FROM restaurants WHERE LOWER(name) = LOWER(?)");
  });

  it("creates a restaurant and normalizes optional fields to null", async () => {
    const run = vi.fn(async () => ({ meta: { last_row_id: 77 } }));
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare };

    const result = await createRestaurant(db, {
      name: "Prime Steakhouse",
      address: "123 Main St",
      google_place_id: "place-123",
      cuisine: "Steakhouse",
      created_by: 123,
    });

    expect(result).toBe(77);
    expect(bind).toHaveBeenCalledWith(
      "Prime Steakhouse",
      "123 Main St",
      "place-123",
      null,
      null,
      null,
      "Steakhouse",
      null,
      null,
      null,
      null,
      null,
      null,
      123
    );
  });

  it("replaces an existing restaurant vote by deleting first and inserting second", async () => {
    const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
    const prepare = vi.fn((sql: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        run: async () => {
          runCalls.push({ sql, bindArgs });
          return { meta: { changes: 1 } };
        },
      }),
    }));
    const db = { prepare };

    await voteForRestaurant(db, 7, 12, 123);

    expect(runCalls).toEqual([
      {
        sql: "DELETE FROM restaurant_votes WHERE poll_id = ? AND user_id = ?",
        bindArgs: [7, 123],
      },
      {
        sql: "INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id) VALUES (?, ?, ?)",
        bindArgs: [7, 12, 123],
      },
    ]);
  });

  it("removes votes, fetches the current vote, and deletes restaurants", async () => {
    const currentVote = { restaurant_id: 9 };
    const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
    const prepare = vi.fn((sql: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        run: async () => {
          runCalls.push({ sql, bindArgs });
          return { meta: { changes: 1 } };
        },
        first: async () => currentVote,
      }),
    }));
    const db = { prepare };

    await removeVote(db, 7, 123);
    await expect(getUserVote(db, 7, 123)).resolves.toEqual(currentVote);
    await deleteRestaurant(db, 9);

    expect(runCalls).toEqual([
      {
        sql: "DELETE FROM restaurant_votes WHERE poll_id = ? AND user_id = ?",
        bindArgs: [7, 123],
      },
      {
        sql: "DELETE FROM restaurants WHERE id = ?",
        bindArgs: [9],
      },
    ]);
  });
});
