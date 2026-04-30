/// <reference types="@cloudflare/workers-types" />

import type { MessageBatch } from "@cloudflare/workers-types";
import { createRequestHandler } from "react-router";
import {
  type EventEmailQueueMessage,
  processEventEmailQueueBatch,
  recoverEventEmailDeliveryBacklog,
} from "../app/lib/event-email-delivery.server";
import { maybeEnsureResendEmailSetup } from "../app/lib/resend-setup.server";
import { sendScheduledSmsReminders } from "../app/lib/sms.server";
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
      const scheduledWork = Promise.all([
        sendScheduledSmsReminders({
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
              console.log("Configured Resend email setup from scheduled bootstrap", {
                domain: result.details.domain,
                deliveryWebhookUrl: result.details.deliveryWebhookUrl,
              });
            }
          })
          .catch((error) => {
            console.error("Scheduled Resend setup bootstrap error:", error);
          }),
      ]);
      if (ctx?.waitUntil) {
        ctx.waitUntil(scheduledWork);
      } else {
        await scheduledWork;
      }
    } catch (error) {
      console.error("Scheduled worker task error:", error);
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
