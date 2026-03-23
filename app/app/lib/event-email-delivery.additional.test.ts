import { describe, expect, it, vi } from "vitest";
import {
  applyResendDeliveryWebhookEvent,
  recoverEventEmailDeliveryBacklog,
  stageEventCancellationDeliveriesForActiveMembers,
  stageEventUpdateDeliveriesForActiveMembers,
  toStagedEventEmailBatchFromQueryResult,
} from "./event-email-delivery.server";

type DeliveryStatus =
  | "pending"
  | "sending"
  | "provider_accepted"
  | "delivered"
  | "delivery_delayed"
  | "retry"
  | "failed"
  | "bounced"
  | "complained";

function createDeliveryDb() {
  const deliveries: Array<{
    id: number;
    batch_id: string;
    event_id: number | null;
    user_id: number | null;
    delivery_type: "update" | "cancel";
    recipient_email: string;
    status: DeliveryStatus;
    provider_message_id: string | null;
    last_queued_at: string | null;
    last_provider_event: string | null;
    last_error: string | null;
    delivered_at: string | null;
  }> = [];
  let nextId = 1;

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const allForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT id FROM users WHERE status = 'active' ORDER BY id ASC") {
        return { results: [{ id: 1 }, { id: 3 }] };
      }

      if (normalizedSql === "SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC") {
        return {
          results: deliveries
            .filter((delivery) => delivery.batch_id === String(bindArgs[0]))
            .map((delivery) => ({ id: delivery.id })),
        };
      }

      if (
        normalizedSql.includes("SELECT id FROM event_email_deliveries") &&
        normalizedSql.includes("status IN ('pending', 'retry', 'sending')")
      ) {
        return {
          results: [{ id: 41 }, { id: 42 }],
        };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT calendar_sequence FROM events WHERE id = ?") {
        return { calendar_sequence: 4 };
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      if (
        normalizedSql.includes("INSERT INTO event_email_deliveries") &&
        normalizedSql.includes("'update'")
      ) {
        const [
          batchId,
          eventId,
          _restaurantName,
          _restaurantAddress,
          _eventDate,
          _eventTime,
          calendarSequence,
          dedupeEventId,
          dedupeSequence,
          _rsvpEventId,
        ] = bindArgs;
        for (const userId of [1, 3]) {
          deliveries.push({
            id: nextId++,
            batch_id: String(batchId),
            event_id: Number(eventId),
            user_id: userId,
            delivery_type: "update",
            recipient_email: `${userId}@example.com`,
            status: "pending",
            provider_message_id: null,
            last_queued_at: null,
            last_provider_event: null,
            last_error: null,
            delivered_at: null,
          });
        }
        expect(calendarSequence).toBe(4);
        expect(dedupeEventId).toBe(22);
        expect(dedupeSequence).toBe(4);
        return { meta: { changes: 2 } };
      }

      if (
        normalizedSql.includes("INSERT INTO event_email_deliveries") &&
        normalizedSql.includes("'cancel'")
      ) {
        const [batchId, eventId] = bindArgs;
        for (const userId of [1, 3]) {
          deliveries.push({
            id: nextId++,
            batch_id: String(batchId),
            event_id: Number(eventId),
            user_id: userId,
            delivery_type: "cancel",
            recipient_email: `${userId}@example.com`,
            status: "pending",
            provider_message_id: null,
            last_queued_at: null,
            last_provider_event: null,
            last_error: null,
            delivered_at: null,
          });
        }
        return { meta: { changes: 2 } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("WHERE id IN (?, ?)")
      ) {
        return { meta: { changes: 2 } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("WHERE provider_message_id = ?")
      ) {
        const [status, providerEvent, failureReason, deliveredStatus, providerMessageId] =
          bindArgs;
        const delivery = deliveries.find(
          (candidate) => candidate.provider_message_id === providerMessageId
        );
        if (!delivery) {
          return { meta: { changes: 0 } };
        }

        delivery.status = status as DeliveryStatus;
        delivery.last_provider_event = String(providerEvent);
        delivery.last_error = failureReason ? String(failureReason) : delivery.last_error;
        if (deliveredStatus === "delivered") {
          delivery.delivered_at = delivery.delivered_at || "2026-03-23 00:00:00";
        }
        return { meta: { changes: 1 } };
      }

      throw new Error(`Unexpected run() query: ${normalizedSql}`);
    };

    return {
      all: () => allForArgs([]),
      first: () => firstForArgs([]),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        all: () => allForArgs(bindArgs),
        first: () => firstForArgs(bindArgs),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { db: { prepare }, deliveries };
}

describe("event-email-delivery additional coverage", () => {
  it("returns null when a staged batch query produced no delivery ids", () => {
    expect(
      toStagedEventEmailBatchFromQueryResult("batch_1", "update", { results: [] } as never)
    ).toBeNull();
  });

  it("stages update deliveries for all active members", async () => {
    const { db, deliveries } = createDeliveryDb();

    const batch = await stageEventUpdateDeliveriesForActiveMembers(db as never, {
      eventId: 22,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "123 Main St",
      eventDate: "2026-06-20",
      eventTime: "18:30",
    });

    expect(batch).toEqual({
      batchId: expect.any(String),
      deliveryIds: [1, 2],
      recipientCount: 2,
      deliveryType: "update",
    });
    expect(deliveries.map((delivery) => delivery.user_id)).toEqual([1, 3]);
  });

  it("stages cancellation deliveries for all active members", async () => {
    const { db, deliveries } = createDeliveryDb();

    const batch = await stageEventCancellationDeliveriesForActiveMembers(db as never, {
      eventId: 22,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "123 Main St",
      eventDate: "2026-06-20",
      eventTime: "18:30",
      sequence: 5,
    });

    expect(batch).toEqual({
      batchId: expect.any(String),
      deliveryIds: [1, 2],
      recipientCount: 2,
      deliveryType: "cancel",
    });
    expect(deliveries.every((delivery) => delivery.delivery_type === "cancel")).toBe(true);
  });

  it("requeues stale backlog deliveries through the queue", async () => {
    const { db } = createDeliveryDb();
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };

    const count = await recoverEventEmailDeliveryBacklog(
      { db: db as never, queue: queue as never },
      25
    );

    expect(count).toBe(2);
    expect(queue.sendBatch).toHaveBeenCalledWith([
      { body: { deliveryId: 41 } },
      { body: { deliveryId: 42 } },
    ]);
  });

  it("ignores unsupported webhook events and missing provider ids", async () => {
    const { db } = createDeliveryDb();

    await expect(
      applyResendDeliveryWebhookEvent(db as never, { type: "email.opened" })
    ).resolves.toEqual({ handled: false, updated: false });

    await expect(
      applyResendDeliveryWebhookEvent(db as never, {
        type: "email.delivered",
        data: {},
      })
    ).resolves.toEqual({ handled: true, updated: false });
  });
});
