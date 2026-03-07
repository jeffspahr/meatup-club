import { describe, expect, it, vi } from "vitest";
import { closePoll, getActivePollLeaders } from "./polls.server";

type ClosePollDbOptions = {
  closeChanges?: number;
  eventId?: number | null;
  failOn?: "insert_event" | null;
};

function createClosePollDb({
  closeChanges = 1,
  eventId = 555,
  failOn = null,
}: ClosePollDbOptions = {}) {
  let storedEventId: number | null = null;
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const firstCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const createStatement = (sql: string, bindArgs: unknown[] = []) => ({
    bind: (...nextBindArgs: unknown[]) => createStatement(sql, nextBindArgs),
    run: async () => {
      runCalls.push({ sql, bindArgs });

      if (sql.includes("INSERT INTO events")) {
        if (failOn === "insert_event") {
          throw new Error("event insert failed");
        }

        storedEventId = eventId;
        return {
          success: true,
          results: [],
          meta: {
            changes: eventId === null ? 0 : 1,
            last_row_id: eventId ?? 0,
          },
        };
      }

      if (sql.includes("UPDATE polls") && sql.includes("WHERE id = ? AND status = 'active'")) {
        return {
          success: true,
          results: [],
          meta: {
            changes: closeChanges,
          },
        };
      }

      throw new Error(`Unexpected run() SQL: ${sql}`);
    },
    first: async () => {
      firstCalls.push({ sql, bindArgs });

      if (sql === "SELECT created_event_id FROM polls WHERE id = ?") {
        return { created_event_id: closeChanges > 0 ? storedEventId : null };
      }

      throw new Error(`Unexpected first() SQL: ${sql}`);
    },
  });

  const prepare = vi.fn((sql: string) =>
    createStatement(sql.replace(/\s+/g, " ").trim())
  );
  const batch = vi.fn(async (statements: Array<{ run: () => Promise<unknown> }>) => {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  });
  const withSession = vi.fn(() => ({ prepare, batch }));

  return { prepare, batch, withSession, runCalls, firstCalls };
}

describe("polls.server", () => {
  it("closes a poll without creating an event", async () => {
    const db = createClosePollDb();

    const result = await closePoll({
      db: db as Parameters<typeof closePoll>[0]["db"],
      pollId: 3,
      closedByUserId: 7,
      winningRestaurantId: 11,
      winningDateId: 22,
      event: null,
    });

    expect(result).toEqual({ ok: true, eventId: null });
    expect(db.batch).not.toHaveBeenCalled();
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE polls"),
        bindArgs: [7, 11, 22, 3],
      }),
    ]);
  });

  it("creates an event and closes the poll through a D1 batch", async () => {
    const db = createClosePollDb({ eventId: 777 });

    const result = await closePoll({
      db: db as Parameters<typeof closePoll>[0]["db"],
      pollId: 3,
      closedByUserId: 7,
      winningRestaurantId: 11,
      winningDateId: 22,
      event: {
        restaurantName: "Prime Steakhouse",
        restaurantAddress: "123 Main St",
        eventDate: "2026-06-10",
        eventTime: "18:30",
      },
    });

    expect(result).toEqual({ ok: true, eventId: 777 });
    expect(db.withSession).toHaveBeenCalledWith("first-primary");
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO events"),
        bindArgs: ["Prime Steakhouse", "123 Main St", "2026-06-10", "18:30", 3],
      }),
      expect.objectContaining({
        sql: expect.stringContaining("created_event_id = last_insert_rowid()"),
        bindArgs: [7, 11, 22, 3],
      }),
    ]);
    expect(db.firstCalls).toEqual([
      expect.objectContaining({
        sql: "SELECT created_event_id FROM polls WHERE id = ?",
        bindArgs: [3],
      }),
    ]);
  });

  it("returns a conflict when the poll is no longer active during close", async () => {
    const db = createClosePollDb({ closeChanges: 0 });

    const result = await closePoll({
      db: db as Parameters<typeof closePoll>[0]["db"],
      pollId: 3,
      closedByUserId: 7,
      winningRestaurantId: 11,
      winningDateId: 22,
      event: {
        restaurantName: "Prime Steakhouse",
        restaurantAddress: "123 Main St",
        eventDate: "2026-06-10",
        eventTime: "18:30",
      },
    });

    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(db.firstCalls).toEqual([]);
  });

  it("propagates D1 write failures from the shared close helper", async () => {
    const db = createClosePollDb({ failOn: "insert_event" });

    await expect(
      closePoll({
        db: db as Parameters<typeof closePoll>[0]["db"],
        pollId: 3,
        closedByUserId: 7,
        winningRestaurantId: 11,
        winningDateId: 22,
        event: {
          restaurantName: "Prime Steakhouse",
          restaurantAddress: "123 Main St",
          eventDate: "2026-06-10",
          eventTime: "18:30",
        },
      })
    ).rejects.toThrow("event insert failed");
  });

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
