/// <reference types="@cloudflare/workers-types" />

import type { MessageBatch } from "@cloudflare/workers-types";
import { createRequestHandler } from "react-router";
import {
  type EventEmailQueueMessage,
  processEventEmailQueueBatch,
  recoverEventEmailDeliveryBacklog,
} from "../app/lib/event-email-delivery.server";
import { logErrorEvent, logInfoEvent } from "../app/lib/observability.server";
import { maybeEnsureResendEmailSetup } from "../app/lib/resend-setup.server";
import {
  maybeCheckTwilioProviderHealth,
  sendScheduledSmsReminders,
} from "../app/lib/sms.server";
import type { CloudflareEnv } from "../app/env";

// In dev, Vite resolves the virtual module to live source so HMR-aware asset
// URLs are served. In prod, the `v8_viteEnvironmentApi` build flow doesn't
// emit `build/client/.vite/manifest.json`, so the virtual server-build can't
// be generated — fall back to the static build output instead.
const build = import.meta.env.DEV
  ? await import("virtual:react-router/server-build")
  : // @ts-expect-error — generated build output has no type declarations
    await import("../build/server/index.js");

const requestHandler = createRequestHandler(build, "production");

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    try {
      const loadContext = build.entry.module.createLoadContext({ env, ctx });
      return await requestHandler(request, loadContext);
    } catch (error) {
      logErrorEvent("worker_fetch_failed", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    try {
      const scheduledWork = Promise.all([
        sendScheduledSmsReminders({
          db: env.DB,
          env,
        }),
        maybeCheckTwilioProviderHealth({
          db: env.DB,
          env,
        }),
        recoverEventEmailDeliveryBacklog({
          db: env.DB,
          queue: env.EMAIL_DELIVERY_QUEUE,
        }),
        maybeEnsureResendEmailSetup({
          db: env.DB,
          resendApiKey: env.RESEND_API_KEY,
        })
          .then((result) => {
            if (result.configured) {
              logInfoEvent("scheduled_resend_setup_configured");
            }
          })
          .catch((error) => {
            logErrorEvent("scheduled_resend_setup_failed", error);
            throw error;
          }),
      ]);
      if (ctx?.waitUntil) {
        ctx.waitUntil(scheduledWork);
      } else {
        await scheduledWork;
      }
    } catch (error) {
      logErrorEvent("scheduled_task_failed", error);
      throw error;
    }
  },
  async queue(batch, env) {
    await processEventEmailQueueBatch({
      batch: batch as MessageBatch<EventEmailQueueMessage>,
      db: env.DB,
      resendApiKey: env.RESEND_API_KEY,
    });
  },
} satisfies ExportedHandler<CloudflareEnv>;
