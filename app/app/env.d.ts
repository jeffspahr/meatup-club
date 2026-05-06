import type { D1Database, Queue } from "@cloudflare/workers-types";
import type { EventEmailQueueMessage } from "./lib/event-email-delivery.server";

/**
 * Cloudflare environment bindings.
 * Keep in sync with wrangler.toml and workers/app.ts.
 */
export interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  EMAIL_DELIVERY_QUEUE?: Queue<EventEmailQueueMessage>;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  RESEND_DELIVERY_WEBHOOK_SECRET?: string;
  GOOGLE_PLACES_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  APP_TIMEZONE?: string;
  DEV_AUTH_BYPASS_EMAIL?: string;
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
    };
  }
}
