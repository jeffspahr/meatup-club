// @vitest-environment node

import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { deliverEventEmailById } from "./event-email-delivery.server";

describe("durable email retries", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (1, 'Steakhouse', '2099-01-01');
    `);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    harness.sqlite.close();
  });

  it.each(["invite", "update", "cancel"])("reuses the exact %s body after an accepted response is lost", async (type) => {
    harness.insert(`INSERT INTO event_email_deliveries (
      id, event_id, user_id, batch_id, delivery_type, recipient_email,
      restaurant_name, event_date, event_time, calendar_sequence, dedupe_key, created_at
    ) VALUES (1, 1, 1, 'batch-1', ?, 'member@example.com',
      'Steakhouse', '2099-01-01', '18:00', 2, ?, '2026-09-16 11:00:00')`, type, `${type}:1:2:1`);
    let originalBody: string | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (originalBody === undefined) {
        originalBody = String(init.body);
        throw new Error("Provider accepted the email, but response connection closed");
      }
      // Resend rejects reuse of an idempotency key with a different payload.
      if (String(init.body) !== originalBody) {
        return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 });
      }
      return Response.json({ id: "accepted-email-1" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const params = { db: harness.db as unknown as D1Database, resendApiKey: "synthetic-key", deliveryId: 1 };
    expect(await deliverEventEmailById(params)).toMatchObject({ outcome: "retry" });
    vi.setSystemTime(new Date("2026-09-16T12:02:00Z"));
    expect(await deliverEventEmailById(params)).toEqual({ outcome: "sent" });
    expect(fetchMock.mock.calls[1][1].body).toBe(originalBody);
    expect(harness.get("SELECT status, provider_message_id FROM event_email_deliveries"))
      .toEqual({ status: "provider_accepted", provider_message_id: "accepted-email-1" });
  });

  it.each([
    ["concurrent_idempotent_requests", "retry"],
    ["invalid_idempotent_request", "failed"],
  ])("handles the provider's %s response as %s", async (name, outcome) => {
    harness.insert(`INSERT INTO event_email_deliveries (
      event_id, user_id, batch_id, delivery_type, recipient_email,
      restaurant_name, event_date, event_time, dedupe_key
    ) VALUES (1, 1, 'batch-1', 'invite', 'member@example.com',
      'Steakhouse', '2099-01-01', '18:00', 'invite:1:0:1')`);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ name }, { status: 409 })));
    expect(await deliverEventEmailById({
      db: harness.db as unknown as D1Database, resendApiKey: "synthetic-key", deliveryId: 1,
    })).toMatchObject({ outcome });
  });
});
