import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.webhooks.sms";
import { persistSmsRsvp } from "../lib/sms-rsvp.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/webhook-idempotency.server", () => ({
  reserveWebhookDelivery: vi.fn(),
}));

vi.mock("../lib/sms-rsvp.server", () => ({
  persistSmsRsvp: vi.fn(),
}));

const futureEvent = {
  event_id: 42,
  restaurant_name: "Test Steakhouse",
  event_date: "2026-05-20",
  event_time: "18:00",
  status: "upcoming",
};

type MockDbOptions = {
  user?: { id: number; status: string; sms_opt_in: number; sms_opt_out_at: string | null } | null;
  latestReminder?: { event_id: number } | null;
  event?: typeof futureEvent | null;
};

function createMockDb({
  user = { id: 7, status: "active", sms_opt_in: 1, sms_opt_out_at: null },
  latestReminder = { event_id: 42 },
  event = futureEvent,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const readCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    return {
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          readCalls.push({ sql: normalizedSql, bindArgs });
          if (normalizedSql.startsWith("SELECT id, status, sms_opt_in")) return user;
          if (normalizedSql.startsWith("SELECT event_id FROM sms_reminders")) return latestReminder;
          if (normalizedSql.startsWith("SELECT id AS event_id")) return event;
          throw new Error(`Unexpected first() query: ${normalizedSql}`);
        },
        run: async () => {
          runCalls.push({ sql: normalizedSql, bindArgs });
          return { meta: { changes: 1 } };
        },
      }),
    };
  });
  const batch = vi.fn(async (statements: Array<{ run: () => Promise<unknown> }>) =>
    await Promise.all(statements.map((statement) => statement.run()))
  );
  return { prepare, batch, runCalls, readCalls };
}

function createRequest({
  body = "YES",
  from = "+15551234567",
  sid = "SM123",
  signature,
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

  const url = "http://localhost/api/webhooks/sms";
  const signedData = [...formData.keys()].sort().reduce(
    (data, key) => `${data}${key}${formData.get(key)}`, url
  );
  return new Request(url, {
    method: "POST",
    headers: {
      "X-Twilio-Signature": signature ?? createHmac("sha1", "token").update(signedData).digest("base64"),
    },
    body: formData,
  });
}

async function getSmsBody(response: Response) {
  return (await response.text()).replaceAll("&apos;", "'");
}

describe("api.webhooks.sms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-10T16:00:00Z").getTime());
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(true);
    vi.mocked(persistSmsRsvp).mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects requests with an invalid Twilio signature", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({ signature: "invalid" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Invalid signature");
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("ignores duplicate Twilio MessageSid deliveries", async () => {
    vi.mocked(persistSmsRsvp).mockResolvedValue(false);
    const db = createMockDb();

    const response = await action({
      request: createRequest({ sid: "SM_DUPLICATE_123" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(await getSmsBody(response)).toContain("already received that response");
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
  });

  it("returns a helpful message when the sender phone number cannot be normalized", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({ from: "invalid" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("couldn't read your phone number");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("handles unknown phone numbers without attempting an RSVP write", async () => {
    const db = createMockDb({ user: null });

    const response = await action({
      request: createRequest(),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("couldn't find your account");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("does not enroll an unknown phone number that texts START", async () => {
    const db = createMockDb({ user: null });

    const response = await action({
      request: createRequest({ body: "START", optOutType: "START" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("opts the user out when they text STOP", async () => {
    const db = createMockDb({
      user: { id: 7, status: "active", sms_opt_in: 1, sms_opt_out_at: null },
    });

    const response = await action({
      request: createRequest({ body: "STOP" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("opted out of Meatup SMS");
    expect(db.runCalls).toEqual([
      {
        sql: "INSERT OR IGNORE INTO sms_consent_events ( user_id, phone_number, event_type, source, disclosure_version, provider_message_sid ) VALUES (?, ?, ?, ?, ?, ?)",
        bindArgs: [
          7,
          "+15551234567",
          "opt_out",
          "sms",
          "sms-reminders-2026-08-22",
          "SM123",
        ],
      },
      {
        sql: "UPDATE users SET sms_opt_in = 0, sms_opt_out_at = CURRENT_TIMESTAMP, sms_opt_out_source = 'sms' WHERE id = ? AND changes() > 0",
        bindArgs: [7],
      },
    ]);
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("syncs Advanced Opt-Out STOP without sending a duplicate reply", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "STOP", optOutType: "STOP" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(db.runCalls).toEqual([
      {
        sql: "INSERT OR IGNORE INTO sms_consent_events ( user_id, phone_number, event_type, source, disclosure_version, provider_message_sid ) VALUES (?, ?, ?, ?, ?, ?)",
        bindArgs: [
          7,
          "+15551234567",
          "opt_out",
          "sms",
          "sms-reminders-2026-08-22",
          "SM123",
        ],
      },
      {
        sql: "UPDATE users SET sms_opt_in = 0, sms_opt_out_at = CURRENT_TIMESTAMP, sms_opt_out_source = 'sms' WHERE id = ? AND changes() > 0",
        bindArgs: [7],
      },
    ]);
  });

  it("syncs Advanced Opt-Out START and restores application consent", async () => {
    const db = createMockDb({
      user: { id: 7, status: "active", sms_opt_in: 0, sms_opt_out_at: "2026-03-01T10:00:00Z" },
    });

    const response = await action({
      request: createRequest({ body: "START", optOutType: "START" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(db.runCalls).toEqual([
      {
        sql: "INSERT OR IGNORE INTO sms_consent_events ( user_id, phone_number, event_type, source, disclosure_version, provider_message_sid ) VALUES (?, ?, ?, ?, ?, ?)",
        bindArgs: [
          7,
          "+15551234567",
          "opt_in",
          "sms",
          "sms-reminders-2026-08-22",
          "SM123",
        ],
      },
      {
        sql: "UPDATE users SET sms_opt_in = 1, sms_opt_out_at = NULL, sms_opt_out_source = NULL WHERE id = ? AND changes() > 0",
        bindArgs: [7],
      },
    ]);
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("enrolls a known prefilled number when the member texts START", async () => {
    const db = createMockDb({
      user: { id: 7, status: "active", sms_opt_in: 0, sms_opt_out_at: null },
    });

    await action({
      request: createRequest({ body: "START", sid: "SM_PREFILLED", optOutType: "START" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(db.runCalls).toEqual([
      {
        sql: "INSERT OR IGNORE INTO sms_consent_events ( user_id, phone_number, event_type, source, disclosure_version, provider_message_sid ) VALUES (?, ?, ?, ?, ?, ?)",
        bindArgs: [
          7,
          "+15551234567",
          "opt_in",
          "sms",
          "sms-reminders-2026-08-22",
          "SM_PREFILLED",
        ],
      },
      {
        sql: "UPDATE users SET sms_opt_in = 1, sms_opt_out_at = NULL, sms_opt_out_source = NULL WHERE id = ? AND changes() > 0",
        bindArgs: [7],
      },
    ]);
  });

  it("keeps YES as an RSVP command if Twilio misclassifies it as START", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "YES", optOutType: "START" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(persistSmsRsvp).toHaveBeenCalledWith({
      db,
      deliveryId: "SM123",
      eventId: 42,
      userId: 7,
      status: "yes",
    });
    expect(await getSmsBody(response)).toContain("(event 42) is set to Yes");
    expect(db.runCalls).toEqual([]);
  });

  it("returns instructions for help and unrecognized replies", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "HELP" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("Reply YES, NO or MAYBE followed by the event number");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("does not duplicate Twilio's Advanced Opt-Out HELP response", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({ body: "HELP", optOutType: "HELP" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("refuses to RSVP when SMS reminders are disabled on the account", async () => {
    const db = createMockDb({
      user: { id: 7, status: "active", sms_opt_in: 0, sms_opt_out_at: null },
    });

    const response = await action({
      request: createRequest(),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("SMS reminders are disabled");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("refuses to RSVP when the account is already opted out", async () => {
    const db = createMockDb({
      user: { id: 7, status: "active", sms_opt_in: 1, sms_opt_out_at: "2026-03-01T10:00:00Z" },
    });

    const response = await action({
      request: createRequest(),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("opted out of SMS");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("uses the latest SMS reminder event for YES replies", async () => {
    const db = createMockDb({
      latestReminder: { event_id: 42 },
    });

    const response = await action({
      request: createRequest({ body: "YES" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
            APP_TIMEZONE: "America/New_York",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(persistSmsRsvp).toHaveBeenCalledWith({
      db,
      deliveryId: "SM123",
      eventId: 42,
      userId: 7,
      status: "yes",
    });
    expect(await getSmsBody(response)).toContain("(event 42) is set to Yes");
  });

  it("returns a clear message when no upcoming event can be found", async () => {
    const db = createMockDb({
      latestReminder: null,
    });

    const response = await action({
      request: createRequest({ body: "YES" }),
      context: createLoadContext({
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
            APP_TIMEZONE: "America/New_York",
          },
        } as never) as never,
      params: {},
    } as never);

    expect(await getSmsBody(response)).toContain("couldn't find an SMS invitation");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it.each([
    ["YES 42", "yes"], ["NO 42", "no"], ["MAYBE 42", "maybe"],
  ])("records %s for the event in the sender's invitation", async (body, status) => {
    const db = createMockDb();
    const response = await action({
      request: createRequest({ body }),
      context: createLoadContext({ env: { DB: db, TWILIO_AUTH_TOKEN: "token" } } as never),
      params: {},
    } as never);
    expect(persistSmsRsvp).toHaveBeenCalledWith({ db, deliveryId: "SM123", eventId: 42, userId: 7, status });
    expect(db.readCalls).toContainEqual({
      sql: "SELECT event_id FROM sms_reminders WHERE user_id = ? AND event_id = ? LIMIT 1",
      bindArgs: [7, 42],
    });
    expect(await getSmsBody(response)).toContain("Test Steakhouse (event 42)");
  });

  it.each(["YES 0", "YES -42", "NO 42.5", "MAYBE 4e2", "YES 9007199254740992", "YES 42 43"])(
    "rejects malformed event number in %s without falling back to another event", async (body) => {
      const db = createMockDb();
      const response = await action({
        request: createRequest({ body }),
        context: createLoadContext({ env: { DB: db, TWILIO_AUTH_TOKEN: "token" } } as never),
        params: {},
      } as never);
      expect(await getSmsBody(response)).toContain("Use the event number from your invitation");
      expect(persistSmsRsvp).not.toHaveBeenCalled();
      expect(db.readCalls).toHaveLength(1);
    }
  );

  it("rejects an explicit event that the sender was never invited to", async () => {
    const db = createMockDb({ latestReminder: null });
    const response = await action({
      request: createRequest({ body: "YES 99" }),
      context: createLoadContext({ env: { DB: db, TWILIO_AUTH_TOKEN: "token" } } as never),
      params: {},
    } as never);
    expect(await getSmsBody(response)).toContain("couldn't find an SMS invitation");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
    expect(db.readCalls).toHaveLength(2);
    expect(db.readCalls[1].bindArgs).toEqual([7, 99]);
  });

  it.each([
    { ...futureEvent, status: "cancelled" },
    { ...futureEvent, event_date: "2026-05-09" },
    { ...futureEvent, event_date: "2026-05-10", event_time: "11:00" },
    null,
  ])("rejects an unavailable event instead of applying the RSVP elsewhere: %j", async (event) => {
    const db = createMockDb({ event });
    const response = await action({
      request: createRequest({ body: "YES" }),
      context: createLoadContext({ env: { DB: db, TWILIO_AUTH_TOKEN: "token" } } as never),
      params: {},
    } as never);
    expect(await getSmsBody(response)).toContain("no longer accepting RSVPs");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
    expect(db.readCalls[1].sql).toBe("SELECT event_id FROM sms_reminders WHERE user_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1");
    expect(db.readCalls).toHaveLength(3);
  });

  it("rejects RSVP commands from an inactive member", async () => {
    const db = createMockDb({ user: { id: 7, status: "inactive", sms_opt_in: 1, sms_opt_out_at: null } });
    const response = await action({
      request: createRequest({ body: "MAYBE 42" }),
      context: createLoadContext({ env: { DB: db, TWILIO_AUTH_TOKEN: "token" } } as never),
      params: {},
    } as never);
    expect(await getSmsBody(response)).toContain("account must be active");
    expect(persistSmsRsvp).not.toHaveBeenCalled();
  });

  it("does not confirm an RSVP when persistence fails", async () => {
    vi.mocked(persistSmsRsvp).mockRejectedValueOnce(new Error("Database write failed"));
    const db = createMockDb();
    await expect(action({
      request: createRequest({ body: "MAYBE 42" }),
      context: createLoadContext({ env: { DB: db, TWILIO_AUTH_TOKEN: "token" } } as never),
      params: {},
    } as never)).rejects.toThrow("Database write failed");
  });

});
