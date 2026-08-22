import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.webhooks.sms";
import { upsertRsvp } from "../lib/rsvps.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import {
  normalizePhoneNumber,
  parseSmsReply,
  parseTwilioOptOutType,
  verifyTwilioSignature,
} from "../lib/sms.server";

vi.mock("../lib/webhook-idempotency.server", () => ({
  reserveWebhookDelivery: vi.fn(),
}));

vi.mock("../lib/rsvps.server", () => ({
  upsertRsvp: vi.fn(),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    getAppTimeZone: vi.fn(() => "America/New_York"),
    getTodayDateStringInTimeZone: vi.fn(() => "2026-05-10"),
  };
});

vi.mock("../lib/sms.server", () => ({
  buildSmsResponse: (message?: string) =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message}</Message>` : ""}</Response>`,
      {
        headers: { "Content-Type": "text/xml" },
      }
    ),
  normalizePhoneNumber: vi.fn(() => "+15551234567"),
  parseSmsReply: vi.fn(() => "yes"),
  parseTwilioOptOutType: vi.fn(() => null),
  verifyTwilioSignature: vi.fn(() => true),
}));

type MockDbOptions = {
  user?: { id: number; sms_opt_in: number; sms_opt_out_at: string | null } | null;
  latestReminder?: { event_id: number } | null;
  nextEvent?: { id: number } | null;
};

function createMockDb({
  user = { id: 7, sms_opt_in: 1, sms_opt_out_at: null },
  latestReminder = { event_id: 42 },
  nextEvent = { id: 91 },
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT id, sms_opt_in, sms_opt_out_at FROM users WHERE phone_number = ?") {
        return user;
      }

      if (
        normalizedSql ===
        "SELECT sr.event_id FROM sms_reminders sr JOIN events e ON e.id = sr.event_id WHERE sr.user_id = ? AND e.status = 'upcoming' AND e.event_date >= ? ORDER BY sr.sent_at DESC LIMIT 1"
      ) {
        return latestReminder;
      }

      if (
        normalizedSql ===
        "SELECT id FROM events WHERE status = 'upcoming' AND event_date >= ? ORDER BY event_date ASC LIMIT 1"
      ) {
        return nextEvent;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });
      return { meta: { changes: 1 } };
    };

    return {
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

function createRequest({
  body = "YES",
  from = "+15551234567",
  sid = "SM123",
  signature = "valid",
  optOutType,
}: {
  body?: string;
  from?: string;
  sid?: string;
  signature?: string;
  optOutType?: "START" | "STOP" | "HELP";
} = {}) {
  const formData = new FormData();
  formData.set("MessageSid", sid);
  formData.set("From", from);
  formData.set("Body", body);
  if (optOutType) {
    formData.set("OptOutType", optOutType);
  }

  return new Request("http://localhost/api/webhooks/sms", {
    method: "POST",
    headers: {
      "X-Twilio-Signature": signature,
    },
    body: formData,
  });
}

async function getSmsBody(response: Response) {
  return await response.text();
}

describe("api.webhooks.sms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyTwilioSignature).mockReturnValue(true);
    vi.mocked(normalizePhoneNumber).mockReturnValue("+15551234567");
    vi.mocked(parseSmsReply).mockReturnValue("yes");
    vi.mocked(parseTwilioOptOutType).mockReturnValue(null);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(true);
    vi.mocked(upsertRsvp).mockResolvedValue("created");
  });

  it("rejects requests with an invalid Twilio signature", async () => {
    vi.mocked(verifyTwilioSignature).mockReturnValue(false);
    const db = createMockDb();

    const response = await action({
      request: createRequest(),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Invalid signature");
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("ignores duplicate Twilio MessageSid deliveries", async () => {
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(false);
    const db = createMockDb();

    const response = await action({
      request: createRequest({ sid: "SM_DUPLICATE_123" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(await getSmsBody(response)).toContain("already received that response");
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("returns a helpful message when the sender phone number cannot be normalized", async () => {
    vi.mocked(normalizePhoneNumber).mockReturnValue("");
    const db = createMockDb();

    const response = await action({
      request: createRequest(),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("couldn't read your phone number");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("handles unknown phone numbers without attempting an RSVP write", async () => {
    const db = createMockDb({ user: null });

    const response = await action({
      request: createRequest(),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("couldn't find your account");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("opts the user out when they text STOP", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("opt_out");
    const db = createMockDb({
      user: { id: 7, sms_opt_in: 1, sms_opt_out_at: null },
    });

    const response = await action({
      request: createRequest({ body: "STOP" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("opted out of Meatup SMS");
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE users SET sms_opt_in = 0, sms_opt_out_at = CURRENT_TIMESTAMP, sms_opt_out_source = 'sms' WHERE id = ?",
        bindArgs: [7],
      },
    ]);
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("syncs Advanced Opt-Out STOP without sending a duplicate reply", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("opt_out");
    vi.mocked(parseTwilioOptOutType).mockReturnValue("opt_out");
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "STOP", optOutType: "STOP" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE users SET sms_opt_in = 0, sms_opt_out_at = CURRENT_TIMESTAMP, sms_opt_out_source = 'sms' WHERE id = ?",
        bindArgs: [7],
      },
    ]);
  });

  it("syncs Advanced Opt-Out START and restores application consent", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("opt_in");
    vi.mocked(parseTwilioOptOutType).mockReturnValue("opt_in");
    const db = createMockDb({
      user: { id: 7, sms_opt_in: 0, sms_opt_out_at: "2026-03-01T10:00:00Z" },
    });

    const response = await action({
      request: createRequest({ body: "START", optOutType: "START" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE users SET sms_opt_in = 1, sms_opt_out_at = NULL, sms_opt_out_source = NULL WHERE id = ?",
        bindArgs: [7],
      },
    ]);
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("keeps YES as an RSVP command if Twilio misclassifies it as START", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("yes");
    vi.mocked(parseTwilioOptOutType).mockReturnValue("opt_in");
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "YES", optOutType: "START" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(upsertRsvp).toHaveBeenCalledWith({
      db,
      eventId: 42,
      userId: 7,
      status: "yes",
    });
    expect(await getSmsBody(response)).toContain("RSVP is set to Yes");
    expect(db.runCalls).toEqual([]);
  });

  it("returns instructions for help and unrecognized replies", async () => {
    vi.mocked(parseSmsReply).mockReturnValue(null);
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "HELP" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("Reply YES or NO to RSVP");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("does not duplicate Twilio's Advanced Opt-Out HELP response", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("help");
    vi.mocked(parseTwilioOptOutType).mockReturnValue("help");
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "HELP", optOutType: "HELP" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("refuses to RSVP when SMS reminders are disabled on the account", async () => {
    const db = createMockDb({
      user: { id: 7, sms_opt_in: 0, sms_opt_out_at: null },
    });

    const response = await action({
      request: createRequest(),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("SMS reminders are disabled");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("refuses to RSVP when the account is already opted out", async () => {
    const db = createMockDb({
      user: { id: 7, sms_opt_in: 1, sms_opt_out_at: "2026-03-01T10:00:00Z" },
    });

    const response = await action({
      request: createRequest(),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("opted out of SMS");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("uses the latest SMS reminder event for YES replies", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("yes");
    const db = createMockDb({
      latestReminder: { event_id: 42 },
      nextEvent: { id: 91 },
    });

    const response = await action({
      request: createRequest({ body: "YES" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
            APP_TIMEZONE: "America/New_York",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(upsertRsvp).toHaveBeenCalledWith({
      db,
      eventId: 42,
      userId: 7,
      status: "yes",
    });
    expect(await getSmsBody(response)).toContain("RSVP is set to Yes");
  });

  it("falls back to the next upcoming event when there is no reminder match", async () => {
    vi.mocked(parseSmsReply).mockReturnValue("no");
    const db = createMockDb({
      latestReminder: null,
      nextEvent: { id: 91 },
    });

    const response = await action({
      request: createRequest({ body: "NO" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
            APP_TIMEZONE: "America/New_York",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(upsertRsvp).toHaveBeenCalledWith({
      db,
      eventId: 91,
      userId: 7,
      status: "no",
    });
    expect(await getSmsBody(response)).toContain("RSVP is set to No");
  });

  it("returns a clear message when no upcoming event can be found", async () => {
    const db = createMockDb({
      latestReminder: null,
      nextEvent: null,
    });

    const response = await action({
      request: createRequest({ body: "YES" }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
            APP_TIMEZONE: "America/New_York",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("couldn't find an upcoming event");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });
});
