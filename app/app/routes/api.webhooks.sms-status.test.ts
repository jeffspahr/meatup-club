import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.webhooks.sms-status";
import {
  parseTwilioMessageStatus,
  recordPollSmsDeliveryStatus,
  recordSmsDeliveryStatus,
  verifyTwilioSignature,
} from "../lib/sms.server";

vi.mock("../lib/sms.server", () => ({
  parseTwilioMessageStatus: vi.fn(() => "delivered"),
  recordPollSmsDeliveryStatus: vi.fn(() => Promise.resolve(true)),
  recordSmsDeliveryStatus: vi.fn(() => Promise.resolve(true)),
  verifyTwilioSignature: vi.fn(() => true),
}));

const deliveryId = "11111111-1111-4111-8111-111111111111";
const messageSid = `SM${"a".repeat(32)}`;

function createRequest({
  status = "delivered",
  sid = messageSid,
  id = deliveryId,
  kind,
}: {
  status?: string;
  sid?: string;
  id?: string;
  kind?: string;
} = {}) {
  const formData = new FormData();
  formData.set("MessageSid", sid);
  formData.set("MessageStatus", status);
  formData.set("ErrorCode", "");

  const url = new URL("https://meatup.club/api/webhooks/sms-status");
  url.searchParams.set("delivery_id", id);
  if (kind) url.searchParams.set("delivery_kind", kind);

  return new Request(url, {
    method: "POST",
    headers: { "X-Twilio-Signature": "valid" },
    body: formData,
  });
}

function createArgs(request: Request) {
  return {
    request,
    context: {
      cloudflare: {
        env: { DB: { prepare: vi.fn() }, TWILIO_AUTH_TOKEN: "token" },
      },
    },
    params: {},
  };
}

describe("api.webhooks.sms-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyTwilioSignature).mockReturnValue(true);
    vi.mocked(parseTwilioMessageStatus).mockReturnValue("delivered");
    vi.mocked(recordPollSmsDeliveryStatus).mockResolvedValue(true);
    vi.mocked(recordSmsDeliveryStatus).mockResolvedValue(true);
  });

  it("rejects invalid Twilio signatures", async () => {
    vi.mocked(verifyTwilioSignature).mockReturnValue(false);

    const response = await action(createArgs(createRequest()) as never);

    expect(response.status).toBe(403);
    expect(recordSmsDeliveryStatus).not.toHaveBeenCalled();
  });

  it("rejects non-form callback bodies without throwing", async () => {
    const request = new Request("https://meatup.club/api/webhooks/sms-status", {
      method: "POST",
    });

    const response = await action(createArgs(request) as never);

    expect(response.status).toBe(400);
    expect(verifyTwilioSignature).not.toHaveBeenCalled();
    expect(recordSmsDeliveryStatus).not.toHaveBeenCalled();
  });

  it("records a valid delivery callback", async () => {
    const args = createArgs(createRequest());

    const response = await action(args as never);

    expect(response.status).toBe(204);
    expect(recordSmsDeliveryStatus).toHaveBeenCalledWith({
      db: args.context.cloudflare.env.DB,
      deliveryId,
      messageSid,
      status: "delivered",
      errorCode: null,
    });
  });

  it("records poll delivery callbacks in the poll delivery table", async () => {
    const args = createArgs(createRequest({ kind: "poll" }));

    const response = await action(args as never);

    expect(response.status).toBe(204);
    expect(recordPollSmsDeliveryStatus).toHaveBeenCalledWith({
      db: args.context.cloudflare.env.DB,
      deliveryId,
      messageSid,
      status: "delivered",
      errorCode: null,
    });
    expect(recordSmsDeliveryStatus).not.toHaveBeenCalled();
  });

  it("rejects unknown delivery kinds", async () => {
    const response = await action(createArgs(createRequest({ kind: "announcement" })) as never);

    expect(response.status).toBe(400);
    expect(recordPollSmsDeliveryStatus).not.toHaveBeenCalled();
    expect(recordSmsDeliveryStatus).not.toHaveBeenCalled();
  });

  it("rejects malformed callback identifiers", async () => {
    const response = await action(createArgs(createRequest({ id: "not-a-delivery" })) as never);

    expect(response.status).toBe(400);
    expect(recordSmsDeliveryStatus).not.toHaveBeenCalled();
  });

  it("returns a retryable error for an unknown delivery", async () => {
    vi.mocked(recordSmsDeliveryStatus).mockResolvedValue(false);

    const response = await action(createArgs(createRequest()) as never);

    expect(response.status).toBe(404);
  });
});
