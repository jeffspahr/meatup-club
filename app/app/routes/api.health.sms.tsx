import type { Route } from "./+types/api.health.sms";
import {
  isSmsProviderHealthFresh,
  maybeCheckTwilioProviderHealth,
} from "../lib/sms.server";
import { logErrorEvent } from "../lib/observability.server";

const MAXIMUM_HEALTH_AGE_MS = 26 * 60 * 60 * 1000;
const MINIMUM_PROVIDER_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function loader({ context }: Route.LoaderArgs): Promise<Response> {
  try {
    const health = await maybeCheckTwilioProviderHealth({
      db: context.cloudflare.env.DB,
      env: context.cloudflare.env,
      minimumIntervalMs: MINIMUM_PROVIDER_CHECK_INTERVAL_MS,
    });
    const healthy = health.status === "healthy"
      && isSmsProviderHealthFresh(health, new Date(), MAXIMUM_HEALTH_AGE_MS);

    return Response.json(
      {
        service: "sms",
        status: healthy ? "healthy" : "unhealthy",
      },
      {
        status: healthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    logErrorEvent("sms_health_endpoint_failed", error);
    return Response.json(
      { service: "sms", status: "unhealthy" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
