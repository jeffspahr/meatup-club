// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./dashboard._index";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("dashboard RSVP action", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (123, 'Steakhouse', '2099-01-01');
    `);
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 0, status: "active" } as never);
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.clearAllMocks();
  });

  function submit(fields: Record<string, string>) {
    const request = new Request("https://meatup.club/dashboard", {
      method: "POST",
      body: new URLSearchParams({ _action: "event_rsvp", event_id: "123", status: "yes", ...fields }),
    });
    return action({
      request,
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it.each(["yes", "no", "maybe"])("persists a first %s response and its comment", async status => {
    expect(await submit({ status, comments: "I will arrive late" })).toEqual({ ok: true, performedAction: "rsvp" });
    expect(harness.get("SELECT user_id, status, comments FROM rsvps")).toEqual({
      user_id: 1, status, comments: "I will arrive late",
    });
  });

  it.each(["accepted", "YES", "unknown"])("rejects invalid status %s without overwriting the RSVP", async status => {
    harness.sqlite.exec("INSERT INTO rsvps (event_id, user_id, status, comments) VALUES (123, 1, 'yes', 'Keep this')");
    expect(await submit({ status })).toEqual({ error: "Invalid RSVP status" });
    expect(harness.get("SELECT status, comments FROM rsvps")).toEqual({ status: "yes", comments: "Keep this" });
    expect(harness.get("SELECT COUNT(*) AS count FROM activity_log")).toEqual({ count: 0 });
  });

  it.each(["not-an-id", "1.5", "-1", "0"])("rejects invalid event id %s", async event_id => {
    expect(await submit({ event_id })).toEqual({ error: "Invalid event ID" });
    expect(harness.get("SELECT COUNT(*) AS count FROM rsvps")).toEqual({ count: 0 });
  });
});
