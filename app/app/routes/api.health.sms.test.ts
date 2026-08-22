import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./api.health.sms";
import { maybeCheckTwilioProviderHealth } from "../lib/sms.server";
import { logErrorEvent } from "../lib/observability.server";

vi.mock("../lib/sms.server", () => ({
  isSmsProviderHealthFresh: vi.fn((health) => health.status === "healthy"),
  maybeCheckTwilioProviderHealth: vi.fn(),
}));

vi.mock("../lib/observability.server", () => ({
  logErrorEvent: vi.fn(),
}));

describe("SMS provider health endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a minimal healthy response without provider details", async () => {
    vi.mocked(maybeCheckTwilioProviderHealth).mockResolvedValueOnce({
      status: "healthy",
      errorCode: null,
      checkedAt: "2026-08-22T18:00:00.000Z",
      lastHealthyAt: "2026-08-22T18:00:00.000Z",
    });

    const response = await loader({
      context: { cloudflare: { env: { DB: {} } } },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ service: "sms", status: "healthy" });
  });

  it("returns 503 without exposing an authentication failure", async () => {
    vi.mocked(maybeCheckTwilioProviderHealth).mockResolvedValueOnce({
      status: "authentication_failed",
      errorCode: "20003",
      checkedAt: "2026-08-22T18:00:00.000Z",
      lastHealthyAt: null,
    });

    const response = await loader({
      context: { cloudflare: { env: { DB: {} } } },
    } as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ service: "sms", status: "unhealthy" });
  });

  it("fails closed when the health check throws", async () => {
    vi.mocked(maybeCheckTwilioProviderHealth).mockRejectedValueOnce(
      new Error("database unavailable")
    );

    const response = await loader({
      context: { cloudflare: { env: { DB: {} } } },
    } as never);

    expect(response.status).toBe(503);
    expect(logErrorEvent).toHaveBeenCalledWith("sms_health_endpoint_failed", expect.any(Error));
  });
});
