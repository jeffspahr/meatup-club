import type { D1Database } from "@cloudflare/workers-types";

/**
 * Cloudflare environment bindings.
 * Keep in sync with wrangler.toml and workers/app.ts.
 */
export interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  GOOGLE_PLACES_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  APP_TIMEZONE?: string;
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
    };
  }
}
