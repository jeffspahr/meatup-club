import { createRequestHandler } from "react-router";
import * as build from "../build/server/index.js";
import { sendScheduledSmsReminders } from "../app/lib/sms.server";

declare global {
  interface CloudflareEnvironment extends Env {}
}

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  APP_TIMEZONE?: string;
};

const requestHandler = createRequestHandler(build, "production");

export default {
  async fetch(request, env, ctx) {
    try {
      return requestHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  async scheduled(event, env, ctx) {
    try {
      const reminderPromise = sendScheduledSmsReminders({
        db: env.DB,
        env,
      });
      if (ctx?.waitUntil) {
        ctx.waitUntil(reminderPromise);
      } else {
        await reminderPromise;
      }
    } catch (error) {
      console.error("Scheduled SMS reminder error:", error);
    }
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
