import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "./support/sqlite-d1";

const authState = vi.hoisted(() => ({
  harness: null as any,
  currentUserId: null as number | null,
}));

const webhookState = vi.hoisted(() => ({
  payload: null as any,
}));

vi.mock("../app/lib/auth.server", () => {
  async function getCurrentUser() {
    if (!authState.harness || authState.currentUserId === null) {
      return null;
    }

    return authState.harness.get("SELECT * FROM users WHERE id = ?", authState.currentUserId);
  }

  return {
    getUser: vi.fn(() => getCurrentUser()),
    requireActiveUser: vi.fn(async () => {
      const user = await getCurrentUser();
      if (!user || user.status !== "active") {
        throw new Response(null, {
          status: 302,
          headers: { Location: "/login" },
        });
      }

      return user;
    }),
    requireAdmin: vi.fn(async () => {
      const user = await getCurrentUser();
      if (!user || user.status !== "active" || user.is_admin !== 1) {
        throw new Response(null, {
          status: 302,
          headers: { Location: "/dashboard" },
        });
      }

      return user;
    }),
  };
});

vi.mock("svix", () => ({
  Webhook: class MockWebhook {
    constructor(_secret: string) {}

    verify() {
      if (!webhookState.payload) {
        throw new Error("Missing webhook payload");
      }

      return webhookState.payload;
    }
  },
}));

import { action as acceptInviteAction, loader as acceptInviteLoader } from "../app/routes/accept-invite";
import { action as adminPollsAction } from "../app/routes/dashboard.admin.polls";
import { action as pollsAction, loader as pollsLoader } from "../app/routes/dashboard.polls";
import { loader as eventsLoader } from "../app/routes/dashboard.events";
import { action as emailWebhookAction } from "../app/routes/api.webhooks.email-rsvp";

function createContext(harness: ReturnType<typeof createSqliteD1Harness>, extraEnv: Record<string, unknown> = {}) {
  const waitUntil = vi.fn((promise: Promise<unknown>) => promise);

  return {
    context: {
      cloudflare: {
        env: {
          DB: harness.db,
          APP_TIMEZONE: "UTC",
          ...extraEnv,
        },
        ctx: { waitUntil },
      },
    } as never,
    waitUntil,
  };
}

function createFormRequest(url: string, fields: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

function setCurrentUser(harness: ReturnType<typeof createSqliteD1Harness>, userId: number | null) {
  authState.harness = harness;
  authState.currentUserId = userId;
}

function createUser(
  harness: ReturnType<typeof createSqliteD1Harness>,
  {
    email,
    status,
    isAdmin = 0,
    name,
    notifyCommentReplies = 1,
  }: {
    email: string;
    status: "invited" | "active";
    isAdmin?: 0 | 1;
    name?: string;
    notifyCommentReplies?: 0 | 1;
  }
) {
  return harness.insert(
    `
      INSERT INTO users (email, name, status, is_admin, notify_comment_replies)
      VALUES (?, ?, ?, ?, ?)
    `,
    email,
    name ?? email.split("@")[0],
    status,
    isAdmin,
    notifyCommentReplies
  );
}

describe("workflow truth suite", () => {
  beforeEach(() => {
    authState.harness = null;
    authState.currentUserId = null;
    webhookState.payload = null;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts an invite and immediately unlocks active-user event access", async () => {
    const harness = createSqliteD1Harness();
    const userId = createUser(harness, {
      email: "invitee@example.com",
      name: "Invitee",
      status: "invited",
    });

    setCurrentUser(harness, userId);

    const { context } = createContext(harness);

    const loaderResult = await acceptInviteLoader({
      request: new Request("http://localhost/accept-invite"),
      context,
      params: {},
    } as never);

    expect(loaderResult).toEqual({
      user: expect.objectContaining({
        id: userId,
        status: "invited",
        email: "invitee@example.com",
      }),
    });

    const response = await acceptInviteAction({
      request: new Request("http://localhost/accept-invite", { method: "POST" }),
      context,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard");
    expect(harness.get("SELECT status FROM users WHERE id = ?", userId)).toEqual({
      status: "active",
    });

    const events = await eventsLoader({
      request: new Request("http://localhost/dashboard/events"),
      context,
      params: {},
    } as never);

    expect(events).toEqual({
      upcomingEvents: [],
      pastEvents: [],
    });
  });

  it("carries member voting through poll closing and exposes the created event to members", async () => {
    const harness = createSqliteD1Harness();
    const adminId = createUser(harness, {
      email: "admin@example.com",
      name: "Admin",
      status: "active",
      isAdmin: 1,
    });
    const memberId = createUser(harness, {
      email: "member@example.com",
      name: "Member",
      status: "active",
    });
    const pollId = harness.insert(
      "INSERT INTO polls (title, status, created_by) VALUES (?, 'active', ?)",
      "Q4 2099 Meatup",
      adminId
    );

    setCurrentUser(harness, memberId);
    const memberContext = createContext(harness).context;

    await pollsAction({
      request: createFormRequest("http://localhost/dashboard/polls", {
        _action: "suggest_date",
        suggested_date: "2099-10-05",
      }),
      context: memberContext,
      params: {},
    } as never);

    await pollsAction({
      request: createFormRequest("http://localhost/dashboard/polls", {
        _action: "suggest_restaurant",
        name: "Prime House",
        address: "123 Main St",
        place_id: "place-123",
        cuisine: "Steakhouse",
      }),
      context: memberContext,
      params: {},
    } as never);

    const restaurant = harness.get<{ id: number }>(
      "SELECT id FROM restaurants WHERE google_place_id = ?",
      "place-123"
    );
    expect(restaurant?.id).toBeTruthy();

    await pollsAction({
      request: createFormRequest("http://localhost/dashboard/polls", {
        _action: "vote_restaurant",
        suggestion_id: String(restaurant?.id),
      }),
      context: memberContext,
      params: {},
    } as never);

    const pollView = await pollsLoader({
      request: new Request("http://localhost/dashboard/polls"),
      context: memberContext,
      params: {},
    } as never);

    expect(pollView.dateSuggestions).toHaveLength(1);
    expect(pollView.dateSuggestions[0]).toEqual(
      expect.objectContaining({
        suggested_date: "2099-10-05",
        vote_count: 1,
        user_has_voted: 1,
      })
    );
    expect(pollView.restaurantSuggestions).toEqual([
      expect.objectContaining({
        id: restaurant?.id,
        name: "Prime House",
        vote_count: 1,
        user_has_voted: 1,
      }),
    ]);

    const winningDate = harness.get<{ id: number }>(
      "SELECT id FROM date_suggestions WHERE poll_id = ?",
      pollId
    );
    expect(winningDate?.id).toBeTruthy();

    setCurrentUser(harness, adminId);
    const adminContext = createContext(harness).context;

    const closeResponse = await adminPollsAction({
      request: createFormRequest("http://localhost/dashboard/admin/polls", {
        _action: "close",
        poll_id: String(pollId),
        winning_restaurant_id: String(restaurant?.id),
        winning_date_id: String(winningDate?.id),
        create_event: "true",
        send_invites: "false",
        event_time: "18:30",
      }),
      context: adminContext,
      params: {},
    } as never);

    expect((closeResponse as Response).status).toBe(302);
    expect((closeResponse as Response).headers.get("Location")).toBe("/dashboard/admin/polls");

    const closedPoll = harness.get<{
      status: string;
      created_event_id: number;
      winning_restaurant_id: number;
      winning_date_id: number;
    }>("SELECT status, created_event_id, winning_restaurant_id, winning_date_id FROM polls WHERE id = ?", pollId);

    expect(closedPoll).toEqual({
      status: "closed",
      created_event_id: expect.any(Number),
      winning_restaurant_id: restaurant?.id,
      winning_date_id: winningDate?.id,
    });

    setCurrentUser(harness, memberId);
    const events = await eventsLoader({
      request: new Request("http://localhost/dashboard/events"),
      context: memberContext,
      params: {},
    } as never);

    expect(events.upcomingEvents).toHaveLength(1);
    expect(events.upcomingEvents[0]).toEqual(
      expect.objectContaining({
        restaurant_name: "Prime House",
        restaurant_address: "123 Main St",
        event_date: "2099-10-05",
        event_time: "18:30",
        userRsvp: null,
      })
    );
  });

  it("processes an inbound RSVP webhook and shows the updated RSVP in the member events view", async () => {
    const harness = createSqliteD1Harness();
    const userId = createUser(harness, {
      email: "member@example.com",
      name: "Member",
      status: "active",
    });
    const eventId = harness.insert(
      `
        INSERT INTO events (restaurant_name, restaurant_address, event_date, event_time, status)
        VALUES (?, ?, ?, ?, 'upcoming')
      `,
      "Prime House",
      "123 Main St",
      "2099-11-15",
      "19:00"
    );

    setCurrentUser(harness, userId);
    webhookState.payload = {
      type: "email.received",
      data: {
        from: "Member <member@example.com>",
        subject: "Accepted: Meatup calendar invite",
        text: `BEGIN:VCALENDAR\nUID:event-${eventId}@meatup.club\nPARTSTAT:ACCEPTED\nEND:VCALENDAR`,
        html: "",
      },
    };

    const { context } = createContext(harness, {
      RESEND_WEBHOOK_SECRET: "test-secret",
    });

    const response = await emailWebhookAction({
      request: new Request("http://localhost/api/webhooks/email-rsvp", {
        method: "POST",
        body: JSON.stringify({ ok: true }),
        headers: {
          "content-type": "application/json",
          "svix-id": "delivery-1",
          "svix-timestamp": "1700000000",
          "svix-signature": "signature",
        },
      }),
      context,
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: "yes",
        }),
      })
    );
    expect(
      harness.get("SELECT provider, delivery_id FROM webhook_deliveries WHERE delivery_id = ?", "delivery-1")
    ).toEqual({
      provider: "resend",
      delivery_id: "delivery-1",
    });

    const events = await eventsLoader({
      request: new Request("http://localhost/dashboard/events"),
      context,
      params: {},
    } as never);

    expect(events.upcomingEvents).toHaveLength(1);
    expect(events.upcomingEvents[0].userRsvp).toEqual(
      expect.objectContaining({
        status: "yes",
        updated_via_calendar: 1,
      })
    );
    expect(events.upcomingEvents[0].allRsvps).toEqual([
      expect.objectContaining({
        user_id: userId,
        status: "yes",
      }),
    ]);
    expect(events.upcomingEvents[0].notResponded).toEqual([]);
  });

  it("creates a threaded reply and sends the comment reply notification email", async () => {
    const harness = createSqliteD1Harness();
    const parentAuthorId = createUser(harness, {
      email: "parent@example.com",
      name: "Parent",
      status: "active",
      notifyCommentReplies: 1,
    });
    const replierId = createUser(harness, {
      email: "replier@example.com",
      name: "Replier",
      status: "active",
    });
    const pollId = harness.insert(
      "INSERT INTO polls (title, status, created_by) VALUES (?, 'active', ?)",
      "Q1 2100 Meatup",
      parentAuthorId
    );
    const parentCommentId = harness.insert(
      `
        INSERT INTO comments (user_id, commentable_type, commentable_id, content)
        VALUES (?, 'poll', ?, ?)
      `,
      parentAuthorId,
      pollId,
      "Original question"
    );

    setCurrentUser(harness, replierId);
    const { context, waitUntil } = createContext(harness, {
      RESEND_API_KEY: "resend-key",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await pollsAction({
      request: createFormRequest("http://localhost/dashboard/polls", {
        _action: "add_comment",
        content: "Thanks for the context",
        parent_id: String(parentCommentId),
      }),
      context,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/polls");

    const comments = await pollsLoader({
      request: new Request("http://localhost/dashboard/polls"),
      context,
      params: {},
    } as never);

    expect(comments.comments).toHaveLength(1);
    expect(comments.comments[0]).toEqual(
      expect.objectContaining({
        id: parentCommentId,
        replies: [
          expect.objectContaining({
            content: "Thanks for the context",
          }),
        ],
      })
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]?.[0];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const emailPayload = JSON.parse(String(requestInit.body));
    expect(emailPayload.to).toEqual(["parent@example.com"]);
    expect(emailPayload.tags).toEqual([
      {
        name: "category",
        value: "comment_reply",
      },
    ]);

    const loggedReply = harness.get<{ action_type: string }>(
      "SELECT action_type FROM activity_log WHERE action_type = 'comment' ORDER BY id DESC LIMIT 1"
    );
    expect(loggedReply).toEqual({ action_type: "comment" });
  });
});
