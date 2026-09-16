// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { sendNewEventSmsNotification } from "../lib/sms.server";
import { action as dashboardAction } from "./dashboard._index";
import { action as adminPollAction } from "./dashboard.admin.polls";
import { action as apiPollAction } from "./api.polls";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));
vi.mock("../lib/sms.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/sms.server")>(),
  sendNewEventSmsNotification: vi.fn(),
}));

const warning = "Event created, but some SMS notifications could not be sent. An admin can retry from Event Management.";

describe("event creation SMS integration", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = createSqliteD1Harness();
    // D1 batches return SELECT rows; the shared write-only fixture omits them.
    const prepare = harness.db.prepare.bind(harness.db);
    vi.spyOn(harness.db, "prepare").mockImplementation((sql) => {
      const statement = prepare(sql);
      if (/^\s*SELECT/i.test(sql)) {
        statement.run = async () => ({
          ...await statement.all(),
          meta: { changes: 0, last_row_id: 0 },
        });
      }
      return statement;
    });
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status, is_admin) VALUES (1, 'admin@example.com', 'active', 1);
      INSERT INTO polls (id, title, status, created_by) VALUES (10, 'Next dinner', 'active', 1);
      INSERT INTO restaurants (id, name, address, created_by) VALUES (20, 'Steakhouse', '123 Main', 1);
      INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id) VALUES (10, 20, 1);
      INSERT INTO date_suggestions (id, user_id, poll_id, suggested_date) VALUES (30, 1, 10, '2099-06-10');
      INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (10, 30, 1);
    `);
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 1, status: "active" } as never);
    vi.mocked(sendNewEventSmsNotification).mockImplementation(async ({ event }) => {
      expect(harness.get("SELECT id FROM events WHERE id = ?", event.id)).toEqual({ id: event.id });
      return { sent: 2, errors: [] };
    });
  });

  afterEach(() => { harness.sqlite.close(); });

  async function create(source: "member" | "admin poll" | "API poll", extra: Record<string, string> = {}) {
    const member = source === "member";
    const body = new URLSearchParams({
      _action: member ? "event_create" : "close",
      restaurant_name: "Steakhouse",
      restaurant_address: "123 Main",
      event_date: "2099-06-10",
      event_time: "18:00",
      poll_id: "10",
      winning_restaurant_id: "20",
      winning_date_id: "30",
      create_event: "true",
      send_invites: "false",
      ...extra,
    });
    const args = {
      request: new Request("https://meatup.club/dashboard", { method: "POST", body }),
      context: createLoadContext({ env: { DB: harness.db, APP_TIMEZONE: "America/New_York" } } as never),
      params: {},
    } as never;
    if (member) return dashboardAction(args);
    if (source === "admin poll") return adminPollAction(args);
    return apiPollAction(args);
  }

  for (const source of ["member", "admin poll", "API poll"] as const) {
    it(`${source} sends after persistence even when email invitations are disabled`, async () => {
      await create(source);
      expect(sendNewEventSmsNotification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        event: {
          id: 1,
          restaurant_name: "Steakhouse",
          restaurant_address: "123 Main",
          event_date: "2099-06-10",
          event_time: "18:00",
        },
      }));
      expect(harness.get("SELECT COUNT(*) AS count FROM event_email_deliveries")).toEqual({ count: 0 });
    });

    it(`${source} preserves the created event and reports an SMS failure`, async () => {
      vi.mocked(sendNewEventSmsNotification).mockResolvedValue({ sent: 0, errors: ["Provider unavailable"] });
      const result = await create(source);
      expect(harness.get("SELECT COUNT(*) AS count FROM events")).toEqual({ count: 1 });
      if (source === "member") {
        expect(result).toEqual({ ok: true, performedAction: "create", warning });
      } else if (source === "admin poll") {
        expect((result as Response).headers.get("Location")).toBe("/dashboard/admin/polls?sms_warning=1");
      } else {
        expect((result as Response).status).toBe(200);
        expect(await (result as Response).json()).toMatchObject({ eventId: 1, warning });
      }
      if (source !== "member") {
        expect(harness.get("SELECT status, created_event_id FROM polls WHERE id = 10")).toEqual({ status: "closed", created_event_id: 1 });
      }
    });

    it(`${source} never sends when event persistence fails`, async () => {
      harness.sqlite.exec("CREATE TRIGGER reject_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'Simulated persistence failure'); END");
      await create(source);
      expect(sendNewEventSmsNotification).not.toHaveBeenCalled();
      expect(harness.get("SELECT COUNT(*) AS count FROM events")).toEqual({ count: 0 });
      expect(harness.get("SELECT status FROM polls WHERE id = 10")).toEqual({ status: "active" });
    });
  }

  it("preserves the dashboard return destination when SMS sending fails", async () => {
    vi.mocked(sendNewEventSmsNotification).mockResolvedValue({ sent: 0, errors: ["Provider unavailable"] });
    const response = await create("admin poll", { return_to: "/dashboard" }) as Response;
    expect(response.headers.get("Location")).toBe("/dashboard?sms_warning=1");
  });

  it.each(["admin poll", "API poll"] as const)("%s does not send when closing without an event", async (source) => {
    await create(source, { create_event: "false" });
    expect(sendNewEventSmsNotification).not.toHaveBeenCalled();
    expect(harness.get("SELECT COUNT(*) AS count FROM events")).toEqual({ count: 0 });
  });
});
