import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyResendDeliveryWebhookEvent,
  deliverEventEmailById,
  enqueueStagedEventEmailBatch,
  getActiveMemberIdsWithoutAcceptedEventEmailDelivery,
  listEventEmailRecipientDeliveryHistory,
  processEventEmailQueueBatch,
  stageEventInviteDeliveriesForActiveMembers,
  stageEventUpdateDeliveriesForUserIds,
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

interface MockUser {
  id: number;
  email: string;
  status: string;
}

interface MockDeliveryRow {
  id: number;
  batch_id: string;
  event_id: number | null;
  user_id: number | null;
  delivery_type: "invite" | "update" | "cancel";
  recipient_email: string;
  rsvp_status: "yes" | "no" | "maybe" | null;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string;
  calendar_sequence: number;
  dedupe_key: string;
  status: DeliveryStatus;
  provider_message_id: string | null;
  attempt_count: number;
  last_error: string | null;
  last_provider_event: string | null;
  last_queued_at: string | null;
  next_attempt_at: string | null;
  sending_started_at: string | null;
  provider_accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

function createMockDeliveryDb({
  users = [
    { id: 1, email: "alpha@example.com", status: "active" },
    { id: 2, email: "bravo@example.com", status: "inactive" },
    { id: 3, email: "charlie@example.com", status: "active" },
  ],
  seededDeliveries = [],
}: {
  users?: MockUser[];
  seededDeliveries?: MockDeliveryRow[];
} = {}) {
  const now = "2026-03-12 12:00:00";
  const deliveries = seededDeliveries.map((delivery) => ({ ...delivery }));
  let nextDeliveryId =
    deliveries.reduce((maxId, delivery) => Math.max(maxId, delivery.id), 0) + 1;

  function normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim();
  }

  function findDelivery(deliveryId: number): MockDeliveryRow | undefined {
    return deliveries.find((delivery) => delivery.id === deliveryId);
  }

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = normalizeSql(sql);

    const firstForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT calendar_sequence FROM events WHERE id = ?") {
        return { calendar_sequence: 4 };
      }

      if (
        normalizedSql.includes("FROM event_email_deliveries") &&
        normalizedSql.includes("WHERE id = ?")
      ) {
        const delivery = findDelivery(Number(bindArgs[0]));
        return delivery ? { ...delivery } : null;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async (bindArgs: unknown[]) => {
      if (
        normalizedSql ===
        "SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC"
      ) {
        return {
          results: deliveries
            .filter((delivery) => delivery.batch_id === bindArgs[0])
            .sort((left, right) => left.id - right.id)
            .map((delivery) => ({ id: delivery.id })),
        };
      }

      if (
        normalizedSql ===
        "SELECT id FROM users WHERE status = 'active' ORDER BY id ASC"
      ) {
        return {
          results: users
            .filter((user) => user.status === "active")
            .sort((left, right) => left.id - right.id)
            .map((user) => ({ id: user.id })),
        };
      }

      if (
        normalizedSql.includes("SELECT u.id") &&
        normalizedSql.includes("NOT EXISTS") &&
        normalizedSql.includes("FROM event_email_deliveries d")
      ) {
        const eventId = Number(bindArgs[0]);
        return {
          results: users
            .filter((user) => user.status === "active")
            .filter(
              (user) =>
                !deliveries.some(
                  (delivery) =>
                    delivery.event_id === eventId &&
                    delivery.user_id === user.id &&
                    (delivery.status === "provider_accepted" || delivery.status === "delivered")
                )
            )
            .sort((left, right) => left.id - right.id)
            .map((user) => ({ id: user.id })),
        };
      }

      if (
        normalizedSql.includes("SELECT summary.event_id") &&
        normalizedSql.includes("FROM (") &&
        normalizedSql.includes("GROUP BY event_id, user_id")
      ) {
        const grouped = new Map<
          string,
          {
            event_id: number;
            user_id: number;
            latest_delivery_id: number;
            has_accepted_delivery: number;
            has_delivered_delivery: number;
          }
        >();

        for (const delivery of deliveries) {
          if (delivery.event_id === null || delivery.user_id === null) {
            continue;
          }

          const key = `${delivery.event_id}:${delivery.user_id}`;
          const current = grouped.get(key);
          const hasAccepted =
            delivery.status === "provider_accepted" || delivery.status === "delivered" ? 1 : 0;
          const hasDelivered = delivery.status === "delivered" ? 1 : 0;

          if (!current) {
            grouped.set(key, {
              event_id: delivery.event_id,
              user_id: delivery.user_id,
              latest_delivery_id: delivery.id,
              has_accepted_delivery: hasAccepted,
              has_delivered_delivery: hasDelivered,
            });
            continue;
          }

          current.latest_delivery_id = Math.max(current.latest_delivery_id, delivery.id);
          current.has_accepted_delivery = Math.max(current.has_accepted_delivery, hasAccepted);
          current.has_delivered_delivery = Math.max(current.has_delivered_delivery, hasDelivered);
        }

        const results = Array.from(grouped.values())
          .sort((left, right) =>
            left.event_id === right.event_id
              ? left.user_id - right.user_id
              : right.event_id - left.event_id
          )
          .map((summary) => {
            const latest = deliveries.find(
              (delivery) => delivery.id === summary.latest_delivery_id
            );
            return {
              ...summary,
              latest_delivery_type: latest?.delivery_type ?? null,
              latest_status: latest?.status ?? null,
            };
          });

        return { results };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      if (
        normalizedSql.includes("INSERT INTO event_email_deliveries") &&
        normalizedSql.includes("'invite'")
      ) {
        const [batchId, eventId, restaurantName, restaurantAddress, eventDate, eventTime] =
          bindArgs;
        const activeUsers = users.filter((user) => user.status === "active");

        for (const user of activeUsers) {
          deliveries.push({
            id: nextDeliveryId++,
            batch_id: String(batchId),
            event_id: Number(eventId),
            user_id: user.id,
            delivery_type: "invite",
            recipient_email: user.email,
            rsvp_status: null,
            restaurant_name: String(restaurantName),
            restaurant_address:
              restaurantAddress === null ? null : String(restaurantAddress),
            event_date: String(eventDate),
            event_time: String(eventTime),
            calendar_sequence: 0,
            dedupe_key: `invite:${eventId}:0:${user.id}`,
            status: "pending",
            provider_message_id: null,
            attempt_count: 0,
            last_error: null,
            last_provider_event: null,
            last_queued_at: null,
            next_attempt_at: now,
            sending_started_at: null,
            provider_accepted_at: null,
            delivered_at: null,
            created_at: now,
            updated_at: now,
          });
        }

        return { meta: { changes: activeUsers.length } };
      }

      if (
        normalizedSql.includes("INSERT INTO event_email_deliveries") &&
        normalizedSql.includes("'update'")
      ) {
        const [
          batchId,
          eventId,
          restaurantName,
          restaurantAddress,
          eventDate,
          eventTime,
          calendarSequence,
          dedupeEventId,
          dedupeSequence,
          _rsvpEventId,
          ...userIds
        ] = bindArgs;
        const requestedUserIds = userIds.map((value) => Number(value));
        const activeUsers = users
          .filter((user) => user.status === "active")
          .filter((user) => requestedUserIds.includes(user.id))
          .sort((left, right) => left.id - right.id);

        for (const user of activeUsers) {
          deliveries.push({
            id: nextDeliveryId++,
            batch_id: String(batchId),
            event_id: Number(eventId),
            user_id: user.id,
            delivery_type: "update",
            recipient_email: user.email,
            rsvp_status: null,
            restaurant_name: String(restaurantName),
            restaurant_address:
              restaurantAddress === null ? null : String(restaurantAddress),
            event_date: String(eventDate),
            event_time: String(eventTime),
            calendar_sequence: Number(calendarSequence),
            dedupe_key: `update:${dedupeEventId}:${dedupeSequence}:${user.id}`,
            status: "pending",
            provider_message_id: null,
            attempt_count: 0,
            last_error: null,
            last_provider_event: null,
            last_queued_at: null,
            next_attempt_at: now,
            sending_started_at: null,
            provider_accepted_at: null,
            delivered_at: null,
            created_at: now,
            updated_at: now,
          });
        }

        return { meta: { changes: activeUsers.length } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("WHERE batch_id = ?")
      ) {
        const batchId = String(bindArgs[0]);
        for (const delivery of deliveries) {
          if (delivery.batch_id === batchId) {
            delivery.last_queued_at = now;
            delivery.updated_at = now;
          }
        }

        return { meta: { changes: 1 } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("SET status = 'sending'")
      ) {
        const [attemptCount, deliveryId] = bindArgs;
        const delivery = findDelivery(Number(deliveryId));
        if (delivery) {
          delivery.status = "sending";
          delivery.attempt_count = Number(attemptCount);
          delivery.sending_started_at = now;
          delivery.updated_at = now;
        }
        return { meta: { changes: delivery ? 1 : 0 } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("SET status = 'retry'")
      ) {
        const [errorMessage, _delayModifier, deliveryId] = bindArgs;
        const delivery = findDelivery(Number(deliveryId));
        if (delivery) {
          delivery.status = "retry";
          delivery.last_error = String(errorMessage);
          delivery.next_attempt_at = now;
          delivery.sending_started_at = null;
          delivery.updated_at = now;
        }
        return { meta: { changes: delivery ? 1 : 0 } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("SET status = 'failed'")
      ) {
        const [errorMessage, deliveryId] = bindArgs;
        const delivery = findDelivery(Number(deliveryId));
        if (delivery) {
          delivery.status = "failed";
          delivery.last_error = String(errorMessage);
          delivery.sending_started_at = null;
          delivery.updated_at = now;
        }
        return { meta: { changes: delivery ? 1 : 0 } };
      }

      if (
        normalizedSql.includes("UPDATE event_email_deliveries") &&
        normalizedSql.includes("SET status = 'provider_accepted'")
      ) {
        const [providerMessageId, deliveryId] = bindArgs;
        const delivery = findDelivery(Number(deliveryId));
        if (delivery) {
          delivery.status = "provider_accepted";
          delivery.provider_message_id = String(providerMessageId);
          delivery.provider_accepted_at = now;
          delivery.last_error = null;
          delivery.sending_started_at = null;
          delivery.updated_at = now;
        }
        return { meta: { changes: delivery ? 1 : 0 } };
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
        if (delivery) {
          delivery.status = status as DeliveryStatus;
          delivery.last_provider_event = String(providerEvent);
          delivery.last_error = failureReason ? String(failureReason) : delivery.last_error;
          if (deliveredStatus === "delivered") {
            delivery.delivered_at = delivery.delivered_at || now;
          }
          delivery.updated_at = now;
        }
        return { meta: { changes: delivery ? 1 : 0 } };
      }

      throw new Error(`Unexpected run() query: ${normalizedSql}`);
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs([]),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(bindArgs),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return {
    db: { prepare },
    deliveries,
  };
}

function createExplodingQueueDb(errorMessage = "delivery row lookup failed") {
  const retryMarks: Array<{ errorMessage: string; deliveryId: number }> = [];
  const failedMarks: Array<{ errorMessage: string; deliveryId: number }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    return {
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          if (
            normalizedSql.includes("FROM event_email_deliveries") &&
            normalizedSql.includes("WHERE id = ?")
          ) {
            throw new Error(errorMessage);
          }

          throw new Error(`Unexpected first() query: ${normalizedSql}`);
        },
        run: async () => {
          if (
            normalizedSql.includes("UPDATE event_email_deliveries") &&
            normalizedSql.includes("SET status = 'retry'")
          ) {
            retryMarks.push({
              errorMessage: String(bindArgs[0]),
              deliveryId: Number(bindArgs[2]),
            });
            return { meta: { changes: 1 } };
          }

          if (
            normalizedSql.includes("UPDATE event_email_deliveries") &&
            normalizedSql.includes("SET status = 'failed'")
          ) {
            failedMarks.push({
              errorMessage: String(bindArgs[0]),
              deliveryId: Number(bindArgs[1]),
            });
            return { meta: { changes: 1 } };
          }

          throw new Error(`Unexpected run() query: ${normalizedSql}`);
        },
      }),
    };
  });

  return {
    db: { prepare },
    retryMarks,
    failedMarks,
  };
}

describe("event-email-delivery.server", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("stages invite deliveries for active members only", async () => {
    const { db, deliveries } = createMockDeliveryDb();

    const batch = await stageEventInviteDeliveriesForActiveMembers(db as never, {
      eventId: 7,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "123 Main St",
      eventDate: "2026-04-20",
      eventTime: "18:30",
    });

    expect(batch).toEqual({
      batchId: expect.any(String),
      deliveryIds: [1, 2],
      recipientCount: 2,
      deliveryType: "invite",
    });
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((delivery) => delivery.recipient_email)).toEqual([
      "alpha@example.com",
      "charlie@example.com",
    ]);
    expect(deliveries.map((delivery) => delivery.dedupe_key)).toEqual([
      "invite:7:0:1",
      "invite:7:0:3",
    ]);
  });

  it("stages update deliveries only for the selected active user ids", async () => {
    const { db, deliveries } = createMockDeliveryDb();

    const batch = await stageEventUpdateDeliveriesForUserIds(
      db as never,
      {
        eventId: 12,
        restaurantName: "Prime Steakhouse",
        restaurantAddress: "123 Main St",
        eventDate: "2026-04-20",
        eventTime: "18:30",
      },
      [3, 1, 3, 999]
    );

    expect(batch).toEqual({
      batchId: expect.any(String),
      deliveryIds: [1, 2],
      recipientCount: 2,
      deliveryType: "update",
    });
    expect(deliveries.map((delivery) => delivery.user_id)).toEqual([1, 3]);
    expect(deliveries.map((delivery) => delivery.dedupe_key)).toEqual([
      "update:12:4:1",
      "update:12:4:3",
    ]);
  });

  it("returns null when update deliveries are requested without any valid positive user ids", async () => {
    const { db, deliveries } = createMockDeliveryDb();

    const batch = await stageEventUpdateDeliveriesForUserIds(
      db as never,
      {
        eventId: 12,
        restaurantName: "Prime Steakhouse",
        restaurantAddress: "123 Main St",
        eventDate: "2026-04-20",
        eventTime: "18:30",
      },
      [0, -1, Number.NaN]
    );

    expect(batch).toBeNull();
    expect(deliveries).toEqual([]);
  });

  it("returns active member ids missing any accepted or delivered row for the event", async () => {
    const { db } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 10,
          batch_id: "batch-accepted",
          event_id: 50,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:50:0:1",
          status: "delivered",
          provider_message_id: null,
          attempt_count: 1,
          last_error: null,
          last_provider_event: "email.delivered",
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: "2026-03-12 12:00:00",
          delivered_at: "2026-03-12 12:00:00",
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    const missingUserIds = await getActiveMemberIdsWithoutAcceptedEventEmailDelivery(
      db as never,
      50
    );

    expect(missingUserIds).toEqual([3]);
  });

  it("lists recipient delivery history with accepted and delivered flags", async () => {
    const { db } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 20,
          batch_id: "batch-pending",
          event_id: 60,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:60:0:1",
          status: "retry",
          provider_message_id: null,
          attempt_count: 1,
          last_error: "temporary",
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
        {
          id: 21,
          batch_id: "batch-delivered",
          event_id: 60,
          user_id: 3,
          delivery_type: "update",
          recipient_email: "charlie@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 1,
          dedupe_key: "update:60:1:3",
          status: "provider_accepted",
          provider_message_id: "email-21",
          attempt_count: 1,
          last_error: null,
          last_provider_event: "email.sent",
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: "2026-03-12 12:00:00",
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    const history = await listEventEmailRecipientDeliveryHistory(db as never);

    expect(history).toEqual([
      {
        eventId: 60,
        userId: 1,
        hasAcceptedDelivery: false,
        hasDeliveredDelivery: false,
        latestDeliveryType: "invite",
        latestStatus: "retry",
      },
      {
        eventId: 60,
        userId: 3,
        hasAcceptedDelivery: true,
        hasDeliveredDelivery: false,
        latestDeliveryType: "update",
        latestStatus: "provider_accepted",
      },
    ]);
  });

  it("enqueues each staged delivery id and stamps the queue timestamp", async () => {
    const { db, deliveries } = createMockDeliveryDb();
    const queue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    };

    const batch = await stageEventInviteDeliveriesForActiveMembers(db as never, {
      eventId: 8,
      restaurantName: "Butcher's Grill",
      restaurantAddress: "500 Oak Ave",
      eventDate: "2026-05-01",
      eventTime: "19:00",
    });

    await enqueueStagedEventEmailBatch(
      {
        db: db as never,
        queue: queue as never,
      },
      batch
    );

    expect(queue.sendBatch).toHaveBeenCalledWith([
      { body: { deliveryId: 1 } },
      { body: { deliveryId: 2 } },
    ]);
    expect(deliveries.every((delivery) => delivery.last_queued_at === "2026-03-12 12:00:00")).toBe(
      true
    );
  });

  it("marks a delivery as provider accepted and forwards the idempotency key to Resend", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 10,
          batch_id: "batch-1",
          event_id: 11,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:11:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-accepted-123" }),
      statusText: "OK",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 10,
    });

    expect(result).toEqual({ outcome: "sent" });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "provider_accepted",
        provider_message_id: "email-accepted-123",
        attempt_count: 1,
      })
    );

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
        "Idempotency-Key": "invite:11:0:1",
      })
    );
  });

  it("skips queue work when the delivery row no longer exists", async () => {
    const { db } = createMockDeliveryDb();
    const ack = vi.fn();
    const retry = vi.fn();

    await processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 999 },
            attempts: 1,
            retry,
            ack,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
    });

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(global.fetch).toBe(originalFetch);
  });

  it("skips deliveries that were already accepted by the provider", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 14,
          batch_id: "batch-skip",
          event_id: 15,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:15:0:1",
          status: "provider_accepted",
          provider_message_id: "email-accepted",
          attempt_count: 1,
          last_error: null,
          last_provider_event: "email.sent",
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: "2026-03-12 12:00:00",
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 14,
    });

    expect(result).toEqual({ outcome: "skip" });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "provider_accepted",
        provider_message_id: "email-accepted",
        attempt_count: 1,
      })
    );
    expect(global.fetch).toBe(originalFetch);
  });

  it("marks a delivery failed when the Resend API key is missing", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 15,
          batch_id: "batch-missing-key",
          event_id: 16,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:16:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: undefined,
      deliveryId: 15,
    });

    expect(result).toEqual({ outcome: "failed" });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error: "RESEND_API_KEY is not configured",
      })
    );
    expect(global.fetch).toBe(originalFetch);
  });

  it("sends update deliveries through the durable update helper", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 18,
          batch_id: "batch-update-success",
          event_id: 19,
          user_id: 1,
          delivery_type: "update",
          recipient_email: "alpha@example.com",
          rsvp_status: "maybe",
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 4,
          dedupe_key: "update:19:4:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-update-19" }),
      text: async () => "OK",
      statusText: "OK",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 18,
    });

    expect(result).toEqual({ outcome: "sent" });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "provider_accepted",
        provider_message_id: "email-update-19",
      })
    );

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({
        "Idempotency-Key": "update:19:4:1",
      })
    );
  });

  it("retries when the durable helper reports a missing provider email id", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 19,
          batch_id: "batch-missing-provider-id",
          event_id: 20,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:20:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => "OK",
      statusText: "OK",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 19,
    });

    expect(result).toEqual({ outcome: "retry", retryDelaySeconds: 60 });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "retry",
        last_error: "Resend accepted the request without returning an email id",
      })
    );
  });

  it("moves transient provider failures into retry state", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 20,
          batch_id: "batch-2",
          event_id: 21,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Retry Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:21:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "temporary outage",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 20,
    });

    expect(result).toEqual({
      outcome: "retry",
      retryDelaySeconds: 60,
    });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "retry",
        attempt_count: 1,
        last_error: "Failed to send email: Service Unavailable",
      })
    );
  });

  it("honors provider retry-after guidance for rate-limited sends", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 41,
          batch_id: "batch-429",
          event_id: 42,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Rate Limit Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:42:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({
        "retry-after": "7",
      }),
      text: async () => "slow down",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 41,
    });

    expect(result).toEqual({
      outcome: "retry",
      retryDelaySeconds: 9,
    });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "retry",
        attempt_count: 1,
        last_error: "Failed to send email: Too Many Requests",
      })
    );
  });

  it("sends cancellation deliveries through the durable cancellation helper", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 42,
          batch_id: "batch-cancel",
          event_id: 77,
          user_id: 1,
          delivery_type: "cancel",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 5,
          dedupe_key: "cancel:77:5:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-cancel-77" }),
      text: async () => "OK",
      statusText: "OK",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 42,
    });

    expect(result).toEqual({ outcome: "sent" });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "provider_accepted",
        provider_message_id: "email-cancel-77",
      })
    );

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({
        "Idempotency-Key": "cancel:77:5:1",
      })
    );
  });

  it("marks a delivery failed when the provider error is not retryable", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 43,
          batch_id: "batch-failed",
          event_id: 44,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "No Retry Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:44:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "bad payload",
    } as never);

    const result = await deliverEventEmailById({
      db: db as never,
      resendApiKey: "test-api-key",
      deliveryId: 43,
    });

    expect(result).toEqual({ outcome: "failed" });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        attempt_count: 1,
        last_error: "Failed to send email: Bad Request",
      })
    );
  });

  it("retries queue messages when a delivery attempt remains retryable", async () => {
    const { db } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 30,
          batch_id: "batch-3",
          event_id: 31,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Queue Retry",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:31:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "temporary outage",
    } as never);

    const retry = vi.fn();
    const ack = vi.fn();

    await processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 30 },
            attempts: 1,
            retry,
            ack,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
    });

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(ack).not.toHaveBeenCalled();
  });

  it("marks a delivery failed and acks when the queue worker exhausts retries after an exception", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 61,
          batch_id: "batch-hard-fail",
          event_id: 62,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Hard Fail Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:62:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 4,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockRejectedValue(new Error("socket closed"));
    const retry = vi.fn();
    const ack = vi.fn();

    await processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 61 },
            attempts: 5,
            retry,
            ack,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
    });

    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error: "socket closed",
      })
    );
  });

  it("retries queue messages with a normalized string error when the provider throws a non-Error value", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 71,
          batch_id: "batch-string-error",
          event_id: 72,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:72:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 1,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    global.fetch = vi.fn().mockRejectedValue("socket closed");
    const retry = vi.fn();
    const ack = vi.fn();

    await processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 71 },
            attempts: 2,
            retry,
            ack,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
    });

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect(ack).not.toHaveBeenCalled();
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "retry",
        last_error: "socket closed",
      })
    );
  });

  it("retries queue messages when delivery lookup throws before a provider call", async () => {
    const { db, retryMarks, failedMarks } = createExplodingQueueDb("lookup exploded");
    const retry = vi.fn();
    const ack = vi.fn();

    await processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 81 },
            attempts: 2,
            retry,
            ack,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
    });

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect(ack).not.toHaveBeenCalled();
    expect(retryMarks).toEqual([{ errorMessage: "lookup exploded", deliveryId: 81 }]);
    expect(failedMarks).toEqual([]);
    expect(global.fetch).toBe(originalFetch);
  });

  it("marks queue messages failed and acks when delivery lookup keeps throwing after max attempts", async () => {
    const { db, retryMarks, failedMarks } = createExplodingQueueDb("lookup exploded");
    const retry = vi.fn();
    const ack = vi.fn();

    await processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 82 },
            attempts: 5,
            retry,
            ack,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
    });

    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retryMarks).toEqual([]);
    expect(failedMarks).toEqual([{ errorMessage: "lookup exploded", deliveryId: 82 }]);
    expect(global.fetch).toBe(originalFetch);
  });

  it("processes queue deliveries sequentially with a throttle between sends", async () => {
    const { db } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 51,
          batch_id: "batch-5",
          event_id: 52,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Queue Pace",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:52:0:1",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
        {
          id: 52,
          batch_id: "batch-5",
          event_id: 52,
          user_id: 3,
          delivery_type: "invite",
          recipient_email: "charlie@example.com",
          rsvp_status: null,
          restaurant_name: "Queue Pace",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:52:0:3",
          status: "pending",
          provider_message_id: null,
          attempt_count: 0,
          last_error: null,
          last_provider_event: null,
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: null,
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    let resolveFirstResponse: ((value: Response) => void) | undefined;
    global.fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstResponse = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "email-52" }),
        text: async () => "OK",
        statusText: "OK",
      } as never);

    const sleep = vi.fn().mockResolvedValue(undefined);
    const ackOne = vi.fn();
    const ackTwo = vi.fn();

    const processPromise = processEventEmailQueueBatch({
      batch: {
        messages: [
          {
            body: { deliveryId: 51 },
            attempts: 1,
            retry: vi.fn(),
            ack: ackOne,
          },
          {
            body: { deliveryId: 52 },
            attempts: 1,
            retry: vi.fn(),
            ack: ackTwo,
          },
        ],
      } as never,
      db: db as never,
      resendApiKey: "test-api-key",
      minSendIntervalMs: 250,
      sleep,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();

    resolveFirstResponse?.({
      ok: true,
      json: async () => ({ id: "email-51" }),
      text: async () => "OK",
      statusText: "OK",
    } as never);

    await vi.waitFor(() => {
      expect(sleep).toHaveBeenCalledWith(250);
    });
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    await processPromise;

    expect(ackOne).toHaveBeenCalledTimes(1);
    expect(ackTwo).toHaveBeenCalledTimes(1);
  });

  it("updates delivery state from Resend webhook events", async () => {
    const { db, deliveries } = createMockDeliveryDb({
      seededDeliveries: [
        {
          id: 40,
          batch_id: "batch-4",
          event_id: 41,
          user_id: 1,
          delivery_type: "invite",
          recipient_email: "alpha@example.com",
          rsvp_status: null,
          restaurant_name: "Webhook Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-04-20",
          event_time: "18:30",
          calendar_sequence: 0,
          dedupe_key: "invite:41:0:1",
          status: "provider_accepted",
          provider_message_id: "email-webhook-123",
          attempt_count: 1,
          last_error: null,
          last_provider_event: "email.sent",
          last_queued_at: null,
          next_attempt_at: "2026-03-12 12:00:00",
          sending_started_at: null,
          provider_accepted_at: "2026-03-12 12:00:00",
          delivered_at: null,
          created_at: "2026-03-12 12:00:00",
          updated_at: "2026-03-12 12:00:00",
        },
      ],
    });

    const result = await applyResendDeliveryWebhookEvent(db as never, {
      type: "email.delivered",
      data: {
        email_id: "email-webhook-123",
      },
    });

    expect(result).toEqual({ handled: true, updated: true });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: "delivered",
        last_provider_event: "email.delivered",
        delivered_at: "2026-03-12 12:00:00",
      })
    );
  });
});
