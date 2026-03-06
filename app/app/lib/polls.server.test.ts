import { describe, expect, it, vi } from "vitest";
import { getActivePollLeaders } from "./polls.server";

describe("polls.server", () => {
  it("returns null leaders when there is no active poll", async () => {
    const prepare = vi.fn(() => ({
      first: async () => null,
      bind: () => ({
        first: async () => null,
      }),
    }));
    const db = { prepare };

    const result = await getActivePollLeaders(db);

    expect(result).toEqual({
      topRestaurant: null,
      topDate: null,
      activePoll: null,
    });
  });

  it("returns the top restaurant and date for the active poll", async () => {
    const bindCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
    const prepare = vi.fn((sql: string) => ({
      first: async () => ({ id: 7, title: "Weekly Poll" }),
      bind: (...bindArgs: unknown[]) => {
        bindCalls.push({ sql, bindArgs });
        return {
          first: async () => {
            if (sql.includes("FROM restaurants r")) {
              return { id: 9, name: "Prime Steakhouse", vote_count: 4 };
            }

            if (sql.includes("FROM date_suggestions ds")) {
              return { id: 17, suggested_date: "2026-05-01", vote_count: 5 };
            }

            return null;
          },
        };
      },
    }));
    const db = { prepare };

    const result = await getActivePollLeaders(db);

    expect(result).toEqual({
      topRestaurant: { id: 9, name: "Prime Steakhouse", vote_count: 4 },
      topDate: { id: 17, suggested_date: "2026-05-01", vote_count: 5 },
      activePoll: { id: 7, title: "Weekly Poll" },
    });
    expect(bindCalls).toEqual([
      expect.objectContaining({ bindArgs: [7, 7] }),
      expect.objectContaining({ bindArgs: [7] }),
    ]);
  });

  it("keeps the active poll while falling back to null when no leaders exist", async () => {
    const prepare = vi.fn((sql: string) => ({
      first: async () => ({ id: 7, title: "Weekly Poll" }),
      bind: () => ({
        first: async () => null,
      }),
    }));
    const db = { prepare };

    const result = await getActivePollLeaders(db);

    expect(result).toEqual({
      topRestaurant: null,
      topDate: null,
      activePoll: { id: 7, title: "Weekly Poll" },
    });
  });
});
