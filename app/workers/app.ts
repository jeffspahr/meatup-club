import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/default/index.js";

declare global {
  interface CloudflareEnvironment extends Env {}
}

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

export default {
  async fetch(request, env, ctx) {
    try {
      // Handle asset requests
      const url = new URL(request.url);
      if (url.pathname.startsWith("/assets/")) {
        return env.ASSETS.fetch(request);
      }

      // Create request handler for each request
      const handler = createRequestHandler({
        build,
        mode: "production",
        getLoadContext: () => ({ cloudflare: { env, ctx } }),
      });

      // Call handler with EventContext for Pages Functions
      return handler({
        request,
        env,
        params: {},
        data: {},
        next: async () => new Response("Not found", { status: 404 }),
        functionPath: url.pathname,
        waitUntil: ctx.waitUntil.bind(ctx),
        passThroughOnException: ctx.passThroughOnException.bind(ctx),
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
