import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSmsReminderMessage,
  buildSmsResponse,
  normalizePhoneNumber,
  parseSmsReply,
  parseTwilioMessageStatus,
  parseTwilioOptOutType,
  recordSmsDeliveryStatus,
  sendAdhocSmsReminder,
  sendScheduledSmsReminders,
  sendSms,
  verifyTwilioSignature,
} from "./sms.server";

type MockDbOptions = {
  events?: Array<Record<string, unknown>>;
  recipients?: Array<Record<string, unknown>>;
};

function createMockDb({ events = [], recipients = [] }: MockDbOptions = {}) {
  const recipientQueryCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const insertCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const all = vi.fn(async () => {
      if (normalizedSql.includes("FROM events WHERE status = 'upcoming'")) {
        return { results: events };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    });

    const bind = (...bindArgs: unknown[]) => ({
      first: vi.fn(async () => null),
      all: vi.fn(async () => {
        if (normalizedSql.includes("FROM users u")) {
          recipientQueryCalls.push({ sql: normalizedSql, bindArgs });
          return { results: recipients };
        }

        throw new Error(`Unexpected bound all() query: ${normalizedSql}`);
      }),
      run: vi.fn(async () => {
        insertCalls.push({ sql: normalizedSql, bindArgs });
        return { meta: { changes: 1 } };
      }),
    });

    return {
      first: vi.fn(async () => null),
      all,
      run: vi.fn(async () => {
        insertCalls.push({ sql: normalizedSql, bindArgs: [] });
        return { meta: { changes: 1 } };
      }),
      bind,
    };
  });

  return {
    prepare,
    recipientQueryCalls,
    insertCalls,
  };
}

describe("normalizePhoneNumber", () => {
  it("normalizes US 10-digit numbers", () => {
    expect(normalizePhoneNumber("555-123-4567")).toBe("+15551234567");
  });

  it("normalizes US 11-digit numbers", () => {
    expect(normalizePhoneNumber("1 (415) 555-0000")).toBe("+14155550000");
  });

  it("accepts E.164 numbers", () => {
    expect(normalizePhoneNumber("+14155551234")).toBe("+14155551234");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhoneNumber("123")).toBeNull();
  });
});

describe("parseSmsReply", () => {
  it("parses yes/no replies", () => {
    expect(parseSmsReply("YES")).toBe("yes");
    expect(parseSmsReply("n")).toBe("no");
    expect(parseSmsReply("yes please")).toBe("yes");
    expect(parseSmsReply("No, thanks")).toBe("no");
  });

  it("parses opt-out keywords", () => {
    expect(parseSmsReply("STOP")).toBe("opt_out");
  });

  it("parses toll-free re-opt-in keywords", () => {
    expect(parseSmsReply("START")).toBe("opt_in");
    expect(parseSmsReply("unstop")).toBe("opt_in");
  });

  it("returns null for unknown text", () => {
    expect(parseSmsReply("maybe")).toBeNull();
  });
});

describe("parseTwilioOptOutType", () => {
  it("maps Twilio Advanced Opt-Out metadata", () => {
    expect(parseTwilioOptOutType("START")).toBe("opt_in");
    expect(parseTwilioOptOutType("stop")).toBe("opt_out");
    expect(parseTwilioOptOutType("HELP")).toBe("help");
  });

  it("ignores missing or unknown metadata", () => {
    expect(parseTwilioOptOutType(null)).toBeNull();
    expect(parseTwilioOptOutType("UNKNOWN")).toBeNull();
  });
});

describe("parseTwilioMessageStatus", () => {
  it("accepts known statuses case-insensitively", () => {
    expect(parseTwilioMessageStatus("DELIVERED")).toBe("delivered");
    expect(parseTwilioMessageStatus("undelivered")).toBe("undelivered");
  });

  it("rejects unknown statuses", () => {
    expect(parseTwilioMessageStatus("unknown")).toBeNull();
  });
});

describe("sms delivery and reminder flows", () => {
  let originalFetch: typeof global.fetch;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({ sid: `SM${"1".repeat(32)}`, status: "queued" }),
      statusText: "OK",
    } as unknown as Response);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("builds reminder messages with relative labels, RSVP status, and opt-out instructions", () => {
    const message = buildSmsReminderMessage({
      event: {
        id: 1,
        restaurant_name: "Prime Steakhouse",
        restaurant_address: "123 Main St",
        event_date: "2026-04-02",
        event_time: "12:00",
      },
      timeZone: "UTC",
      rsvpStatus: "maybe",
      now: new Date("2026-04-01T12:05:00Z"),
      customMessage: "Heads up",
    });

    expect(message).toContain("Heads up");
    expect(message).toContain("Reminder for tomorrow at 12:00 PM");
    expect(message).toContain("Prime Steakhouse");
    expect(message).toContain("Your RSVP: Maybe.");
    expect(message).toContain("Details: https://meatup.club/dashboard");
    expect(message).not.toContain("/dashboard/events");
    expect(message).toContain(
      "Reply YES or NO to RSVP. Reply HELP for help. Reply STOP to opt out."
    );
  });

  it("returns an error without calling Twilio when credentials are missing", async () => {
    const result = await sendSms({
      to: "+15551234567",
      body: "Test reminder",
      env: {},
    });

    expect(result).toEqual({
      success: false,
      error: "Missing Twilio credentials.",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends Twilio requests with basic auth and form-encoded params", async () => {
    const result = await sendSms({
      to: "+15551234567",
      body: "Test reminder",
      env: {
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15557654321",
      },
    });

    expect(result).toEqual({
      success: true,
      messageSid: `SM${"1".repeat(32)}`,
      status: "queued",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    const headers = new Headers(requestInit?.headers as HeadersInit);
    const body = new URLSearchParams(String(requestInit?.body));

    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("AC123:secret").toString("base64")}`
    );
    expect(body.get("To")).toBe("+15551234567");
    expect(body.get("From")).toBe("+15557654321");
    expect(body.get("Body")).toBe("Test reminder");
  });

  it("returns the Twilio response body when message delivery fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ code: 21211, message: "Invalid destination number" }),
      statusText: "Bad Request",
    } as unknown as Response);

    const result = await sendSms({
      to: "+15551234567",
      body: "Test reminder",
      env: {
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15557654321",
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid destination number",
      errorCode: "21211",
    });
  });

  it("verifies Twilio request signatures using the provided auth token", () => {
    const params = new URLSearchParams({
      Body: "YES",
      From: "+15551234567",
      MessageSid: "SM123",
    });
    const url = "https://meatup.club/api/webhooks/sms";
    const expectedSignature = createHmac("sha1", "secret-token")
      .update(`${url}BodyYESFrom+15551234567MessageSidSM123`)
      .digest("base64");

    expect(
      verifyTwilioSignature({
        url,
        params,
        signature: expectedSignature,
        authToken: "secret-token",
      })
    ).toBe(true);

    expect(
      verifyTwilioSignature({
        url,
        params,
        signature: null,
        authToken: "secret-token",
      })
    ).toBe(false);
  });

  it("builds XML SMS responses and escapes special characters", async () => {
    const response = buildSmsResponse('Use <YES> & "STOP"');
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(body).toContain("&lt;YES&gt;");
    expect(body).toContain("&amp;");
    expect(body).toContain("&quot;STOP&quot;");
  });

  it("sends scheduled reminders inside the delivery window and records them", async () => {
    const db = createMockDb({
      events: [
        {
          id: 77,
          restaurant_name: "Prime Steakhouse",
          event_date: "2026-04-02",
          event_time: "12:00",
          status: "upcoming",
        },
      ],
      recipients: [
        {
          id: 8,
          phone_number: "+15551234567",
          rsvp_status: "maybe",
        },
      ],
    });

    await sendScheduledSmsReminders({
      db: db as never,
      env: {
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15557654321",
        APP_TIMEZONE: "UTC",
      },
      now: new Date("2026-04-01T12:05:00Z"),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.recipientQueryCalls).toEqual([
      expect.objectContaining({
        bindArgs: [77, 77, "24h"],
      }),
    ]);
    expect(
      db.insertCalls.filter((call) => call.sql.startsWith("INSERT OR IGNORE INTO sms_reminders"))
    ).toEqual([expect.objectContaining({ bindArgs: [77, 8, "24h"] })]);

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    const body = new URLSearchParams(String(requestInit?.body));
    expect(body.get("Body")).toContain("Your RSVP: Maybe.");
    expect(body.get("Body")).toContain("/dashboard?event=77#event-77");
    expect(body.get("StatusCallback")).toMatch(
      /^https:\/\/meatup\.club\/api\/webhooks\/sms-status\?delivery_id=/
    );
  });

  it("sends a reminder after one delayed cron interval", async () => {
    const db = createMockDb({
      events: [
        {
          id: 78,
          restaurant_name: "Prime Steakhouse",
          event_date: "2026-04-02",
          event_time: "12:00",
          status: "upcoming",
        },
      ],
      recipients: [
        {
          id: 9,
          phone_number: "+15551234567",
          rsvp_status: "yes",
        },
      ],
    });

    await sendScheduledSmsReminders({
      db: db as never,
      env: {
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15557654321",
        APP_TIMEZONE: "UTC",
      },
      now: new Date("2026-04-01T12:20:00Z"),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.recipientQueryCalls[0]?.bindArgs).toEqual([78, 78, "24h"]);
    expect(
      db.insertCalls.find((call) => call.sql.startsWith("INSERT OR IGNORE INTO sms_reminders"))
        ?.bindArgs
    ).toEqual([78, 9, "24h"]);
  });

  it("returns an explicit error for adhoc reminders when credentials are missing", async () => {
    const result = await sendAdhocSmsReminder({
      db: createMockDb() as never,
      env: {},
      event: {
        id: 88,
        restaurant_name: "Prime Steakhouse",
        event_date: "2026-04-03",
        event_time: "18:00",
      },
    });

    expect(result).toEqual({
      sent: 0,
      errors: ["Twilio credentials are missing."],
    });
  });

  it("supports specific-scope adhoc reminders with no user id by selecting nobody", async () => {
    const db = createMockDb();

    const result = await sendAdhocSmsReminder({
      db: db as never,
      env: {
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15557654321",
        APP_TIMEZONE: "UTC",
      },
      event: {
        id: 89,
        restaurant_name: "Prime Steakhouse",
        event_date: "2026-04-03",
        event_time: "18:00",
      },
      recipientScope: "specific",
    });

    expect(result).toEqual({ sent: 0, errors: [] });
    expect(db.recipientQueryCalls[0]?.sql).toContain("AND 1 = 0");
    expect(db.recipientQueryCalls[0]?.bindArgs).toEqual([89]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends adhoc reminders for maybe RSVPs and aggregates Twilio failures", async () => {
    const db = createMockDb({
      recipients: [
        {
          id: 1,
          phone_number: "+15550000001",
          rsvp_status: "maybe",
        },
        {
          id: 2,
          phone_number: "+15550000002",
          rsvp_status: "maybe",
        },
      ],
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({ sid: `SM${"2".repeat(32)}`, status: "queued" }),
        statusText: "OK",
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ code: 20500, message: "Twilio outage" }),
        statusText: "Service Unavailable",
      } as unknown as Response);

    const result = await sendAdhocSmsReminder({
      db: db as never,
      env: {
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15557654321",
        APP_TIMEZONE: "UTC",
      },
      event: {
        id: 90,
        restaurant_name: "Prime Steakhouse",
        event_date: "2026-04-03",
        event_time: "18:00",
      },
      customMessage: "Tonight is still on",
      recipientScope: "maybe",
    });

    expect(result.sent).toBe(1);
    expect(result.errors).toEqual(["Member 2: Twilio outage"]);
    expect(db.recipientQueryCalls[0]?.sql).toContain("AND r.status = ?");
    expect(db.recipientQueryCalls[0]?.bindArgs).toEqual([90, "maybe"]);
    const reminderInsert = db.insertCalls.find((call) =>
      call.sql.startsWith("INSERT OR IGNORE INTO sms_reminders")
    );
    expect(reminderInsert?.bindArgs[0]).toBe(90);
    expect(reminderInsert?.bindArgs[1]).toBe(1);
    expect(String(reminderInsert?.bindArgs[2])).toMatch(/^adhoc:[0-9a-f-]{36}$/);
  });

  it("persists ranked delivery status updates", async () => {
    const db = createMockDb();

    const recorded = await recordSmsDeliveryStatus({
      db: db as never,
      deliveryId: "11111111-1111-4111-8111-111111111111",
      messageSid: `SM${"3".repeat(32)}`,
      status: "delivered",
    });

    expect(recorded).toBe(true);
    expect(db.insertCalls.at(-1)).toEqual(
      expect.objectContaining({
        bindArgs: expect.arrayContaining(["delivered", 50]),
      })
    );
  });
});
