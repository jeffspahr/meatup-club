import type { D1Database, D1Result, Queue } from "@cloudflare/workers-types";
import type { AuthUser } from "./auth.server";
import { logActivity } from "./activity.server";
import {
  buildCreateEventStatement,
  buildSelectLastInsertedEventIdStatement,
  buildUpdateEventStatement,
  canEditEvent,
  getEditableEventById,
  getInsertedEventIdFromQueryResult,
  parseEventMutationFormData,
} from "./events.server";
import {
  buildSelectStagedDeliveryIdsStatement,
  buildStageEventInviteDeliveriesForLastInsertedEventStatement,
  buildStageEventUpdateDeliveriesForActiveMembersStatement,
  enqueueStagedEventEmailBatch,
  toStagedEventEmailBatchFromQueryResult,
  type EventEmailQueueMessage,
  type StagedEventEmailBatch,
} from "./event-email-delivery.server";
import { upsertRsvp } from "./rsvps.server";

export type EventMutationResult = {
  ok?: true;
  performedAction?: "create" | "update" | "rsvp";
  error?: string;
};

export interface EventActionContext {
  db: D1Database;
  queue?: Queue<EventEmailQueueMessage>;
  user: AuthUser;
  formData: FormData;
  request: Request;
  route: string;
}

export async function runCreateEventAction(
  ctx: EventActionContext
): Promise<EventMutationResult> {
  const { db, queue, user, formData, request, route } = ctx;
  const sendInvites = formData.get("send_invites") === "true";
  const parsed = parseEventMutationFormData(formData);

  if (parsed.error || !parsed.value) {
    return { error: parsed.error || "Failed to create event" };
  }

  const input = parsed.value;
  const queueContext = { db, queue };

  try {
    let stagedInviteBatch: StagedEventEmailBatch | null = null;
    const createBatchId = sendInvites ? crypto.randomUUID() : null;
    const createStatements = [
      buildCreateEventStatement(db, input, user.id),
      buildSelectLastInsertedEventIdStatement(db),
    ];

    if (createBatchId) {
      createStatements.push(
        buildStageEventInviteDeliveriesForLastInsertedEventStatement(db, {
          batchId: createBatchId,
          details: {
            restaurantName: input.restaurantName,
            restaurantAddress: input.restaurantAddress,
            eventDate: input.eventDate,
            eventTime: input.eventTime,
          },
        }),
        buildSelectStagedDeliveryIdsStatement(db, createBatchId)
      );
    }

    const createResults = await db.batch(createStatements);
    const eventId =
      getInsertedEventIdFromQueryResult(
        createResults[1] as D1Result<{ id: number }>
      ) || 0;

    if (!eventId) {
      throw new Error("Failed to determine created event id");
    }

    if (createBatchId) {
      stagedInviteBatch = toStagedEventEmailBatchFromQueryResult(
        createBatchId,
        "invite",
        createResults[createResults.length - 1] as D1Result<{ id: number }>
      );
    }

    try {
      await enqueueStagedEventEmailBatch(queueContext, stagedInviteBatch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to enqueue staged event invite deliveries", {
        eventId,
        message,
      });
    }

    await logActivity({
      db,
      userId: user.id,
      actionType: "create_event",
      actionDetails: { event_id: eventId, send_invites: sendInvites },
      route,
      request,
    });

    return { ok: true, performedAction: "create" };
  } catch (error) {
    console.error("Event creation error:", error);
    return { error: "Failed to create event" };
  }
}

export async function runUpdateEventAction(
  ctx: EventActionContext
): Promise<EventMutationResult> {
  const { db, queue, user, formData, request, route } = ctx;
  const eventId = Number(formData.get("id"));
  const sendUpdates = formData.get("send_updates") === "true";

  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { error: "Event ID is required" };
  }

  const existingEvent = await getEditableEventById(db, eventId);
  if (!existingEvent) {
    return { error: "Event not found" };
  }

  if (!canEditEvent(user, existingEvent)) {
    return { error: "You do not have permission to edit this event" };
  }

  const parsed = parseEventMutationFormData(formData);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error || "Failed to update event" };
  }

  const queueContext = { db, queue };

  try {
    const input = {
      ...parsed.value,
      status: existingEvent.status === "cancelled" ? "cancelled" : "upcoming",
    } as const;

    const nextSequence = Number(existingEvent.calendar_sequence ?? 0) + 1;
    let stagedUpdateBatch: StagedEventEmailBatch | null = null;
    const updateBatchId = sendUpdates ? crypto.randomUUID() : null;
    const updateStatements = [
      buildUpdateEventStatement(db, eventId, input, nextSequence),
    ];

    if (updateBatchId) {
      updateStatements.push(
        buildStageEventUpdateDeliveriesForActiveMembersStatement(db, {
          batchId: updateBatchId,
          details: {
            eventId,
            restaurantName: input.restaurantName,
            restaurantAddress: input.restaurantAddress,
            eventDate: input.eventDate,
            eventTime: input.eventTime,
          },
          calendarSequence: nextSequence,
        }),
        buildSelectStagedDeliveryIdsStatement(db, updateBatchId)
      );
    }

    const updateResults = await db.batch(updateStatements);

    if (updateBatchId) {
      stagedUpdateBatch = toStagedEventEmailBatchFromQueryResult(
        updateBatchId,
        "update",
        updateResults[updateResults.length - 1] as D1Result<{ id: number }>
      );
    }

    try {
      await enqueueStagedEventEmailBatch(queueContext, stagedUpdateBatch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to enqueue staged event update deliveries", {
        eventId,
        message,
      });
    }

    await logActivity({
      db,
      userId: user.id,
      actionType: "update_event",
      actionDetails: { event_id: eventId, send_updates: sendUpdates },
      route,
      request,
    });

    return { ok: true, performedAction: "update" };
  } catch (error) {
    console.error("Event update error:", error);
    return { error: "Failed to update event" };
  }
}

export async function runRsvpEventAction(
  ctx: EventActionContext
): Promise<EventMutationResult> {
  const { db, user, formData, request, route } = ctx;
  const eventId = formData.get("event_id");
  const status = formData.get("status");
  const comments = formData.get("comments");

  if (!eventId || !status) {
    return { error: "Missing required fields" };
  }

  const result = await upsertRsvp({
    db,
    eventId: Number(eventId),
    userId: user.id,
    status: String(status),
    comments: (comments as string) || null,
  });

  await logActivity({
    db,
    userId: user.id,
    actionType: result === "created" ? "rsvp" : "update_rsvp",
    actionDetails: { event_id: eventId, status, comments },
    route,
    request,
  });

  return { ok: true, performedAction: "rsvp" };
}
