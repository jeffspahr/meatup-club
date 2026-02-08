/// <reference types="@cloudflare/workers-types" />

import { createRequestHandler } from "react-router";
// @ts-expect-error — generated build output has no type declarations
import * as build from "../build/server/index.js";
import { sendScheduledSmsReminders } from "../app/lib/sms.server";
import type { CloudflareEnv } from "../app/env";

const requestHandler = createRequestHandler(build, "production");

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    try {
      return requestHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
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
} satisfies ExportedHandler<CloudflareEnv>;
