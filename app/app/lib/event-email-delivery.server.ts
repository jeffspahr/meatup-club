import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  MessageBatch,
  Queue,
} from "@cloudflare/workers-types";
import {
  sendEventCancellationEmail,
  sendEventInviteEmail,
  sendEventUpdateEmail,
} from "./email.server";

export type EventEmailDeliveryType = "invite" | "update" | "cancel";
export type EventEmailDeliveryStatus =
  | "pending"
  | "sending"
  | "provider_accepted"
  | "delivered"
  | "delivery_delayed"
  | "retry"
  | "failed"
  | "bounced"
  | "complained";

export interface EventEmailQueueMessage {
  deliveryId: number;
}

export interface EventEmailQueueContext {
  db: D1Database;
  queue?: Queue<EventEmailQueueMessage>;
}

export interface EventEmailDetails {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
}

export interface EventEmailRecipientDeliveryHistory {
  eventId: number;
  userId: number;
  hasAcceptedDelivery: boolean;
  hasDeliveredDelivery: boolean;
  latestDeliveryType: EventEmailDeliveryType | null;
  latestStatus: EventEmailDeliveryStatus | null;
}

export interface EventCancellationEmailDetails extends EventEmailDetails {
  sequence: number;
}

interface EventEmailDeliveryRow {
  id: number;
  event_id: number | null;
  user_id: number | null;
  delivery_type: EventEmailDeliveryType;
  recipient_email: string;
  rsvp_status: "yes" | "no" | "maybe" | null;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string;
  calendar_sequence: number;
  dedupe_key: string;
  status: EventEmailDeliveryStatus;
  provider_message_id: string | null;
  attempt_count: number;
}

export interface StagedEventEmailBatch {
  batchId: string;
  deliveryIds: number[];
  recipientCount: number;
  deliveryType: EventEmailDeliveryType;
}

interface EventEmailQueueBatchOptions {
  minSendIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface DeliveryAttemptResult {
  outcome: "sent" | "retry" | "failed" | "skip";
  retryDelaySeconds?: number;
}

interface ResendDeliveryWebhookPayload {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    reason?: string;
    response?: string;
    created_at?: string;
  };
}

const TERMINAL_STATUSES: ReadonlySet<EventEmailDeliveryStatus> = new Set([
  "delivered",
  "failed",
  "bounced",
  "complained",
]);

const MAX_DELIVERY_ATTEMPTS = 5;
const RECOVERY_REQUEUE_WINDOW_MINUTES = 10;
const EVENT_EMAIL_MIN_SEND_INTERVAL_MS = 1000;
const MAX_RETRY_JITTER_SECONDS = 4;

function getRetryDelaySeconds(attemptCount: number): number {
  return Math.min(60 * 2 ** Math.max(attemptCount - 1, 0), 15 * 60);
}

function getRetryJitterSeconds(deliveryId: number, attemptCount: number): number {
  return (deliveryId + attemptCount) % (MAX_RETRY_JITTER_SECONDS + 1);
}

function getRetryDelayWithJitterSeconds(params: {
  attemptCount: number;
  deliveryId: number;
  providerRetryDelaySeconds?: number;
}): number {
  const baseDelaySeconds =
    params.providerRetryDelaySeconds ?? getRetryDelaySeconds(params.attemptCount);
  if (params.providerRetryDelaySeconds === undefined) {
    return baseDelaySeconds;
  }

  return baseDelaySeconds + getRetryJitterSeconds(params.deliveryId, params.attemptCount);
}

async function sleepForMs(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toDelayModifier(delaySeconds: number): string {
  return `+${delaySeconds} seconds`;
}

function normalizeNumber(value: unknown): number {
  return Number(value ?? 0);
}

function getUniquePositiveNumbers(values: number[]): number[] {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0))
  ).sort((left, right) => left - right);
}

function getResendFailureReason(payload: ResendDeliveryWebhookPayload): string | null {
  const reason = payload.data?.reason?.trim();
  if (reason) {
    return reason;
  }

  const response = payload.data?.response?.trim();
  return response || null;
}

async function insertDeliveryRows(
  db: D1Database,
  query: string,
  bindings: unknown[],
  deliveryType: EventEmailDeliveryType
): Promise<StagedEventEmailBatch | null> {
  const batchId = crypto.randomUUID();
  await db.prepare(query).bind(batchId, ...bindings).run();

  const insertedResult = await db
    .prepare(
      `
        SELECT id
        FROM event_email_deliveries
        WHERE batch_id = ?
        ORDER BY id ASC
      `
    )
    .bind(batchId)
    .all();

  const deliveryIds = ((insertedResult.results || []) as Array<{ id: number }>).map((row) =>
    Number(row.id)
  );

  if (deliveryIds.length === 0) {
    return null;
  }

  return {
    batchId,
    deliveryIds,
    recipientCount: deliveryIds.length,
    deliveryType,
  };
}

export function buildSelectStagedDeliveryIdsStatement(
  db: D1Database,
  batchId: string
): D1PreparedStatement {
  return db
    .prepare(
      `
        SELECT id
        FROM event_email_deliveries
        WHERE batch_id = ?
        ORDER BY id ASC
      `
    )
    .bind(batchId);
}

export function toStagedEventEmailBatchFromQueryResult(
  batchId: string,
  deliveryType: EventEmailDeliveryType,
  result: D1Result<{ id: number }>
): StagedEventEmailBatch | null {
  const deliveryIds = ((result.results || []) as Array<{ id: number }>).map((row) =>
    Number(row.id)
  );

  if (deliveryIds.length === 0) {
    return null;
  }

  return {
    batchId,
    deliveryIds,
    recipientCount: deliveryIds.length,
    deliveryType,
  };
}

async function getActiveMemberIds(db: D1Database): Promise<number[]> {
  const result = await db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE status = 'active'
        ORDER BY id ASC
      `
    )
    .all();

  return ((result.results || []) as Array<{ id: number }>).map((row) => Number(row.id));
}

export async function getActiveMemberIdsWithoutAcceptedEventEmailDelivery(
  db: D1Database,
  eventId: number
): Promise<number[]> {
  const result = await db
    .prepare(
      `
        SELECT u.id
        FROM users u
        WHERE u.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM event_email_deliveries d
            WHERE d.event_id = ?
              AND d.user_id = u.id
              AND d.status IN ('provider_accepted', 'delivered')
          )
        ORDER BY u.id ASC
      `
    )
    .bind(eventId)
    .all();

  return ((result.results || []) as Array<{ id: number }>).map((row) => Number(row.id));
}

export async function listEventEmailRecipientDeliveryHistory(
  db: D1Database
): Promise<EventEmailRecipientDeliveryHistory[]> {
  const result = await db
    .prepare(
      `
        SELECT
          summary.event_id,
          summary.user_id,
          summary.has_accepted_delivery,
          summary.has_delivered_delivery,
          latest.delivery_type AS latest_delivery_type,
          latest.status AS latest_status
        FROM (
          SELECT
            event_id,
            user_id,
            MAX(id) AS latest_delivery_id,
            MAX(CASE
              WHEN status IN ('provider_accepted', 'delivered') THEN 1
              ELSE 0
            END) AS has_accepted_delivery,
            MAX(CASE
              WHEN status = 'delivered' THEN 1
              ELSE 0
            END) AS has_delivered_delivery
          FROM event_email_deliveries
          WHERE event_id IS NOT NULL
            AND user_id IS NOT NULL
          GROUP BY event_id, user_id
        ) summary
        JOIN event_email_deliveries latest
          ON latest.id = summary.latest_delivery_id
        ORDER BY summary.event_id DESC, summary.user_id ASC
      `
    )
    .all();

  return ((result.results || []) as Array<{
    event_id: number;
    user_id: number;
    has_accepted_delivery: number;
    has_delivered_delivery: number;
    latest_delivery_type: EventEmailDeliveryType | null;
    latest_status: EventEmailDeliveryStatus | null;
  }>).map((row) => ({
    eventId: Number(row.event_id),
    userId: Number(row.user_id),
    hasAcceptedDelivery: normalizeNumber(row.has_accepted_delivery) === 1,
    hasDeliveredDelivery: normalizeNumber(row.has_delivered_delivery) === 1,
    latestDeliveryType: row.latest_delivery_type,
    latestStatus: row.latest_status,
  }));
}

export async function stageEventInviteDeliveriesForActiveMembers(
  db: D1Database,
  details: EventEmailDetails
): Promise<StagedEventEmailBatch | null> {
  return insertDeliveryRows(
    db,
    `
      INSERT INTO event_email_deliveries (
        batch_id,
        event_id,
        user_id,
        delivery_type,
        recipient_email,
        rsvp_status,
        restaurant_name,
        restaurant_address,
        event_date,
        event_time,
        calendar_sequence,
        dedupe_key
      )
      SELECT
        ?,
        ?,
        u.id,
        'invite',
        u.email,
        r.status,
        ?,
        ?,
        ?,
        ?,
        0,
        'invite:' || ? || ':0:' || u.id
      FROM users u
      LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
      WHERE u.status = 'active'
    `,
    [
      details.eventId,
      details.restaurantName,
      details.restaurantAddress,
      details.eventDate,
      details.eventTime,
      details.eventId,
      details.eventId,
    ],
    "invite"
  );
}

export function buildStageEventInviteDeliveriesForLastInsertedEventStatement(
  db: D1Database,
  params: {
    batchId: string;
    details: Omit<EventEmailDetails, "eventId">;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `
        INSERT INTO event_email_deliveries (
          batch_id,
          event_id,
          user_id,
          delivery_type,
          recipient_email,
          rsvp_status,
          restaurant_name,
          restaurant_address,
          event_date,
          event_time,
          calendar_sequence,
          dedupe_key
        )
        SELECT
          ?,
          last_insert_rowid(),
          u.id,
          'invite',
          u.email,
          r.status,
          ?,
          ?,
          ?,
          ?,
          0,
          'invite:' || last_insert_rowid() || ':0:' || u.id
        FROM users u
        LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = last_insert_rowid()
        WHERE u.status = 'active'
      `
    )
    .bind(
      params.batchId,
      params.details.restaurantName,
      params.details.restaurantAddress,
      params.details.eventDate,
      params.details.eventTime
    );
}

export async function stageEventUpdateDeliveriesForUserIds(
  db: D1Database,
  details: EventEmailDetails,
  userIds: number[]
): Promise<StagedEventEmailBatch | null> {
  const uniqueUserIds = getUniquePositiveNumbers(userIds);
  if (uniqueUserIds.length === 0) {
    return null;
  }

  const eventMeta = await db
    .prepare("SELECT calendar_sequence FROM events WHERE id = ?")
    .bind(details.eventId)
    .first();
  const calendarSequence = normalizeNumber(
    (eventMeta as { calendar_sequence?: number | null } | null)?.calendar_sequence ?? 1
  );
  const userPlaceholders = uniqueUserIds.map(() => "?").join(", ");

  return insertDeliveryRows(
    db,
    buildStageEventUpdateDeliveriesStatementQuery(uniqueUserIds),
    buildStageEventUpdateDeliveriesStatementBindings({
      batchId: undefined,
      details,
      userIds: uniqueUserIds,
      calendarSequence,
    }).slice(1),
    "update"
  );
}

function buildStageEventUpdateDeliveriesStatementQuery(userIds: number[]): string {
  const userPlaceholders = userIds.map(() => "?").join(", ");

  return `
    INSERT INTO event_email_deliveries (
      batch_id,
      event_id,
      user_id,
      delivery_type,
      recipient_email,
      rsvp_status,
      restaurant_name,
      restaurant_address,
      event_date,
      event_time,
      calendar_sequence,
      dedupe_key
    )
    SELECT
      ?,
      ?,
      u.id,
      'update',
      u.email,
      r.status,
      ?,
      ?,
      ?,
      ?,
      ?,
      'update:' || ? || ':' || ? || ':' || u.id
    FROM users u
    LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
    WHERE u.status = 'active'
      AND u.id IN (${userPlaceholders})
    ORDER BY u.id ASC
  `;
}

function buildStageEventUpdateDeliveriesStatementBindings(params: {
  batchId?: string;
  details: EventEmailDetails;
  userIds: number[];
  calendarSequence: number;
}): unknown[] {
  const uniqueUserIds = getUniquePositiveNumbers(params.userIds);

  return [
    params.batchId,
    params.details.eventId,
    params.details.restaurantName,
    params.details.restaurantAddress,
    params.details.eventDate,
    params.details.eventTime,
    params.calendarSequence,
    params.details.eventId,
    params.calendarSequence,
    params.details.eventId,
    ...uniqueUserIds,
  ];
}

function buildStageEventUpdateDeliveriesForActiveMembersStatementQuery(): string {
  return `
    INSERT INTO event_email_deliveries (
      batch_id,
      event_id,
      user_id,
      delivery_type,
      recipient_email,
      rsvp_status,
      restaurant_name,
      restaurant_address,
      event_date,
      event_time,
      calendar_sequence,
      dedupe_key
    )
    SELECT
      ?,
      ?,
      u.id,
      'update',
      u.email,
      r.status,
      ?,
      ?,
      ?,
      ?,
      ?,
      'update:' || ? || ':' || ? || ':' || u.id
    FROM users u
    LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
    WHERE u.status = 'active'
    ORDER BY u.id ASC
  `;
}

function buildStageEventUpdateDeliveriesForActiveMembersStatementBindings(params: {
  batchId: string;
  details: EventEmailDetails;
  calendarSequence: number;
}): unknown[] {
  return [
    params.batchId,
    params.details.eventId,
    params.details.restaurantName,
    params.details.restaurantAddress,
    params.details.eventDate,
    params.details.eventTime,
    params.calendarSequence,
    params.details.eventId,
    params.calendarSequence,
    params.details.eventId,
  ];
}

export function buildStageEventUpdateDeliveriesStatement(
  db: D1Database,
  params: {
    batchId: string;
    details: EventEmailDetails;
    userIds: number[];
    calendarSequence: number;
  }
): D1PreparedStatement {
  const uniqueUserIds = getUniquePositiveNumbers(params.userIds);

  return db
    .prepare(buildStageEventUpdateDeliveriesStatementQuery(uniqueUserIds))
    .bind(
      ...buildStageEventUpdateDeliveriesStatementBindings({
        batchId: params.batchId,
        details: params.details,
        userIds: uniqueUserIds,
        calendarSequence: params.calendarSequence,
      })
    );
}

export function buildStageEventUpdateDeliveriesForActiveMembersStatement(
  db: D1Database,
  params: {
    batchId: string;
    details: EventEmailDetails;
    calendarSequence: number;
  }
): D1PreparedStatement {
  return db
    .prepare(buildStageEventUpdateDeliveriesForActiveMembersStatementQuery())
    .bind(
      ...buildStageEventUpdateDeliveriesForActiveMembersStatementBindings(params)
    );
}

export async function stageEventUpdateDeliveriesForActiveMembers(
  db: D1Database,
  details: EventEmailDetails
): Promise<StagedEventEmailBatch | null> {
  const activeUserIds = await getActiveMemberIds(db);
  return stageEventUpdateDeliveriesForUserIds(db, details, activeUserIds);
}

export async function stageEventCancellationDeliveriesForActiveMembers(
  db: D1Database,
  details: EventCancellationEmailDetails
): Promise<StagedEventEmailBatch | null> {
  return insertDeliveryRows(
    db,
    `
      INSERT INTO event_email_deliveries (
        batch_id,
        event_id,
        user_id,
        delivery_type,
        recipient_email,
        rsvp_status,
        restaurant_name,
        restaurant_address,
        event_date,
        event_time,
        calendar_sequence,
        dedupe_key
      )
      SELECT
        ?,
        ?,
        u.id,
        'cancel',
        u.email,
        NULL,
        ?,
        ?,
        ?,
        ?,
        ?,
        'cancel:' || ? || ':' || ? || ':' || u.id
      FROM users u
      WHERE u.status = 'active'
    `,
    [
      details.eventId,
      details.restaurantName,
      details.restaurantAddress,
      details.eventDate,
      details.eventTime,
      details.sequence,
      details.eventId,
      details.sequence,
    ],
    "cancel"
  );
}

export function buildStageEventCancellationDeliveriesForActiveMembersStatement(
  db: D1Database,
  params: {
    batchId: string;
    details: EventCancellationEmailDetails;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `
        INSERT INTO event_email_deliveries (
          batch_id,
          event_id,
          user_id,
          delivery_type,
          recipient_email,
          rsvp_status,
          restaurant_name,
          restaurant_address,
          event_date,
          event_time,
          calendar_sequence,
          dedupe_key
        )
        SELECT
          ?,
          ?,
          u.id,
          'cancel',
          u.email,
          NULL,
          ?,
          ?,
          ?,
          ?,
          ?,
          'cancel:' || ? || ':' || ? || ':' || u.id
        FROM users u
        WHERE u.status = 'active'
      `
    )
    .bind(
      params.batchId,
      params.details.eventId,
      params.details.restaurantName,
      params.details.restaurantAddress,
      params.details.eventDate,
      params.details.eventTime,
      params.details.sequence,
      params.details.eventId,
      params.details.sequence
    );
}

export async function enqueueStagedEventEmailBatch(
  context: EventEmailQueueContext,
  stagedBatch: StagedEventEmailBatch | null
): Promise<void> {
  if (!stagedBatch || stagedBatch.deliveryIds.length === 0) {
    return;
  }

  if (!context.queue) {
    console.error("EMAIL_DELIVERY_QUEUE is not configured; leaving deliveries pending", {
      batchId: stagedBatch.batchId,
      recipientCount: stagedBatch.recipientCount,
      deliveryType: stagedBatch.deliveryType,
    });
    return;
  }

  await context.queue.sendBatch(
    stagedBatch.deliveryIds.map((deliveryId) => ({
      body: { deliveryId },
    }))
  );

  await context.db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET last_queued_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = ?
      `
    )
    .bind(stagedBatch.batchId)
    .run();
}

export async function recoverEventEmailDeliveryBacklog(
  context: EventEmailQueueContext,
  limit: number = 100
): Promise<number> {
  if (!context.queue) {
    return 0;
  }

  const rowsResult = await context.db
    .prepare(
      `
        SELECT id
        FROM event_email_deliveries
        WHERE provider_message_id IS NULL
          AND status IN ('pending', 'retry', 'sending')
          AND next_attempt_at <= CURRENT_TIMESTAMP
          AND (
            last_queued_at IS NULL OR
            last_queued_at < datetime('now', ?)
          )
        ORDER BY created_at ASC
        LIMIT ?
      `
    )
    .bind(`-${RECOVERY_REQUEUE_WINDOW_MINUTES} minutes`, limit)
    .all();

  const rows = (rowsResult.results || []) as Array<{ id: number }>;
  if (rows.length === 0) {
    return 0;
  }

  const deliveryIds = rows.map((row) => Number(row.id));
  await context.queue.sendBatch(
    deliveryIds.map((deliveryId) => ({
      body: { deliveryId },
    }))
  );

  await context.db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET last_queued_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${deliveryIds.map(() => "?").join(", ")})
      `
    )
    .bind(...deliveryIds)
    .run();

  return deliveryIds.length;
}

function isRetryableSendFailure(
  result: { success?: boolean; retryable?: boolean } | null | undefined
): boolean {
  if (result?.success === true) {
    return false;
  }

  return result?.retryable !== false;
}

async function markDeliveryForRetry(
  db: D1Database,
  deliveryId: number,
  errorMessage: string,
  delaySeconds: number
): Promise<void> {
  await db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET status = 'retry',
            last_error = ?,
            next_attempt_at = datetime('now', ?),
            sending_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .bind(errorMessage, toDelayModifier(delaySeconds), deliveryId)
    .run();
}

async function markDeliveryFailed(
  db: D1Database,
  deliveryId: number,
  errorMessage: string
): Promise<void> {
  await db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET status = 'failed',
            last_error = ?,
            sending_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .bind(errorMessage, deliveryId)
    .run();
}

async function markDeliveryAccepted(
  db: D1Database,
  deliveryId: number,
  providerMessageId: string
): Promise<void> {
  await db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET status = 'provider_accepted',
            provider_message_id = ?,
            provider_accepted_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            sending_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .bind(providerMessageId, deliveryId)
    .run();
}

export async function deliverEventEmailById(params: {
  db: D1Database;
  resendApiKey?: string;
  deliveryId: number;
}): Promise<DeliveryAttemptResult> {
  const delivery = await params.db
    .prepare(
      `
        SELECT
          id,
          event_id,
          user_id,
          delivery_type,
          recipient_email,
          rsvp_status,
          restaurant_name,
          restaurant_address,
          event_date,
          event_time,
          calendar_sequence,
          dedupe_key,
          status,
          provider_message_id,
          attempt_count
        FROM event_email_deliveries
        WHERE id = ?
      `
    )
    .bind(params.deliveryId)
    .first() as EventEmailDeliveryRow | null;

  if (!delivery) {
    return { outcome: "skip" };
  }

  if (delivery.provider_message_id || TERMINAL_STATUSES.has(delivery.status)) {
    return { outcome: "skip" };
  }

  if (!params.resendApiKey) {
    await markDeliveryFailed(params.db, delivery.id, "RESEND_API_KEY is not configured");
    return { outcome: "failed" };
  }

  const nextAttemptCount = normalizeNumber(delivery.attempt_count) + 1;
  await params.db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET status = 'sending',
            attempt_count = ?,
            sending_started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .bind(nextAttemptCount, delivery.id)
    .run();

  let result:
    | Awaited<ReturnType<typeof sendEventInviteEmail>>
    | Awaited<ReturnType<typeof sendEventUpdateEmail>>
    | Awaited<ReturnType<typeof sendEventCancellationEmail>>;

  if (delivery.delivery_type === "invite") {
    result = await sendEventInviteEmail({
      eventId: delivery.event_id ?? 0,
      restaurantName: delivery.restaurant_name,
      restaurantAddress: delivery.restaurant_address,
      eventDate: delivery.event_date,
      eventTime: delivery.event_time,
      userEmail: delivery.recipient_email,
      rsvpStatus: delivery.rsvp_status ?? undefined,
      resendApiKey: params.resendApiKey,
      idempotencyKey: delivery.dedupe_key,
    });
  } else if (delivery.delivery_type === "update") {
    result = await sendEventUpdateEmail({
      eventId: delivery.event_id ?? 0,
      restaurantName: delivery.restaurant_name,
      restaurantAddress: delivery.restaurant_address,
      eventDate: delivery.event_date,
      eventTime: delivery.event_time,
      userEmail: delivery.recipient_email,
      rsvpStatus: delivery.rsvp_status ?? undefined,
      sequence: delivery.calendar_sequence,
      resendApiKey: params.resendApiKey,
      idempotencyKey: delivery.dedupe_key,
    });
  } else {
    result = await sendEventCancellationEmail({
      eventId: delivery.event_id ?? 0,
      restaurantName: delivery.restaurant_name,
      restaurantAddress: delivery.restaurant_address,
      eventDate: delivery.event_date,
      eventTime: delivery.event_time,
      userEmail: delivery.recipient_email,
      sequence: delivery.calendar_sequence,
      resendApiKey: params.resendApiKey,
      idempotencyKey: delivery.dedupe_key,
    });
  }

  if (result.success && result.providerMessageId) {
    await markDeliveryAccepted(params.db, delivery.id, result.providerMessageId);
    return { outcome: "sent" };
  }

  const errorMessage = result.success
    ? "Provider accepted response without an email id"
    : result.error;

  if (nextAttemptCount < MAX_DELIVERY_ATTEMPTS && isRetryableSendFailure(result)) {
    const retryDelaySeconds = getRetryDelayWithJitterSeconds({
      attemptCount: nextAttemptCount,
      deliveryId: delivery.id,
      providerRetryDelaySeconds: result.success ? undefined : result.retryAfterSeconds,
    });
    await markDeliveryForRetry(params.db, delivery.id, errorMessage, retryDelaySeconds);
    return { outcome: "retry", retryDelaySeconds };
  }

  await markDeliveryFailed(params.db, delivery.id, errorMessage);
  return { outcome: "failed" };
}

export async function processEventEmailQueueBatch(params: {
  batch: MessageBatch<EventEmailQueueMessage>;
  db: D1Database;
  resendApiKey?: string;
} & EventEmailQueueBatchOptions): Promise<void> {
  const sleep = params.sleep ?? sleepForMs;
  const minSendIntervalMs = params.minSendIntervalMs ?? EVENT_EMAIL_MIN_SEND_INTERVAL_MS;

  for (const [index, message] of params.batch.messages.entries()) {
    if (index > 0) {
      await sleep(minSendIntervalMs);
    }

    try {
      const result = await deliverEventEmailById({
        db: params.db,
        resendApiKey: params.resendApiKey,
        deliveryId: message.body.deliveryId,
      });

      if (result.outcome === "retry") {
        message.retry({ delaySeconds: result.retryDelaySeconds });
        continue;
      }

      message.ack();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (message.attempts >= MAX_DELIVERY_ATTEMPTS) {
        await markDeliveryFailed(params.db, message.body.deliveryId, errorMessage);
        message.ack();
        continue;
      }

      const delaySeconds = getRetryDelayWithJitterSeconds({
        attemptCount: message.attempts,
        deliveryId: message.body.deliveryId,
      });
      await markDeliveryForRetry(params.db, message.body.deliveryId, errorMessage, delaySeconds);
      message.retry({ delaySeconds });
    }
  }
}

export async function applyResendDeliveryWebhookEvent(
  db: D1Database,
  payload: ResendDeliveryWebhookPayload
): Promise<{ handled: boolean; updated: boolean }> {
  const statusMap: Record<string, EventEmailDeliveryStatus> = {
    "email.sent": "provider_accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.failed": "failed",
    "email.bounced": "bounced",
    "email.complained": "complained",
  };

  const status = statusMap[payload.type];
  if (!status) {
    return { handled: false, updated: false };
  }

  const providerMessageId = payload.data?.email_id;
  if (!providerMessageId) {
    return { handled: true, updated: false };
  }

  const failureReason = getResendFailureReason(payload);
  const updateResult = await db
    .prepare(
      `
        UPDATE event_email_deliveries
        SET status = ?,
            last_provider_event = ?,
            last_error = COALESCE(?, last_error),
            delivered_at = CASE
              WHEN ? = 'delivered' THEN COALESCE(delivered_at, CURRENT_TIMESTAMP)
              ELSE delivered_at
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE provider_message_id = ?
      `
    )
    .bind(status, payload.type, failureReason, status, providerMessageId)
    .run();

  const changes = normalizeNumber((updateResult as { meta?: { changes?: number } } | undefined)?.meta?.changes);
  return { handled: true, updated: changes > 0 };
}
