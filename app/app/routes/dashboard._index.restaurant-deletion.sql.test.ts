// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./dashboard._index";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("restaurant deletion ownership against SQLite", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES
        (1, 'caller@example.test', 'active'), (2, 'owner@example.test', 'active');
      INSERT INTO restaurants (id, name, created_by) VALUES
        (1, 'Other member restaurant', 2), (10, 'Own restaurant', 1);
      INSERT INTO polls (id, title, status, created_by) VALUES (1, 'Dinner', 'active', 1);
      INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id) VALUES (1, 1, 2);
    `);
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 0, status: "active" } as never);
  });
  afterEach(() => { harness.sqlite.close(); vi.clearAllMocks(); });

  function submit(id: string) {
    return action({
      request: new Request("https://example.test/dashboard", {
        method: "POST", body: new URLSearchParams({ _action: "delete_restaurant", restaurant_id: id }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never), params: {},
    } as never);
  }

  it.each(["1e1", "1.0e1", "0xA", "10.0", "10junk", "0", "-1", "9007199254740993"])(
    "rejects noncanonical or unsafe ID %s without deleting any restaurant or vote", async id => {
      const restaurants = harness.all("SELECT * FROM restaurants ORDER BY id");
      const votes = harness.all("SELECT * FROM restaurant_votes");
      expect(await submit(id)).toEqual({ error: "Invalid restaurant ID" });
      expect(harness.all("SELECT * FROM restaurants ORDER BY id")).toEqual(restaurants);
      expect(harness.all("SELECT * FROM restaurant_votes")).toEqual(votes);
    },
  );
  it("denies a canonical ID belonging to another member", async () => {
    expect(await submit("1")).toEqual({ error: "You do not have permission to delete this restaurant" });
    expect(harness.get("SELECT id FROM restaurants WHERE id = 1")).toEqual({ id: 1 });
    expect(harness.all("SELECT restaurant_id FROM restaurant_votes")).toEqual([{ restaurant_id: 1 }]);
  });
  it("deletes the caller's own restaurant", async () => {
    expect(await submit("10")).toEqual({ ok: true });
    expect(harness.all("SELECT id FROM restaurants")).toEqual([{ id: 1 }]);
  });
  it("permits an administrator to delete another member's restaurant and its votes", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 1, status: "active" } as never);
    expect(await submit("1")).toEqual({ ok: true });
    expect(harness.all("SELECT id FROM restaurants")).toEqual([{ id: 10 }]);
    expect(harness.all("SELECT * FROM restaurant_votes")).toEqual([]);
  });
  it("rejects missing and unknown IDs", async () => {
    expect(await submit("")).toEqual({ error: "Restaurant ID is required" });
    expect(await submit("999")).toEqual({ error: "Restaurant not found" });
  });
});
