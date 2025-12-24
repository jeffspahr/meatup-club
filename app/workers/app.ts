import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/default/index.js";

declare global {
  interface CloudflareEnvironment extends Env {}
}

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const requestHandler = createRequestHandler({
  build,
  mode: "production",
});

export default {
  async fetch(request, env, ctx) {
    // Create a Pages Function compatible context
    const context = {
      request,
      env,
      params: {},
      data: {},
      next: async () => new Response("Not found", { status: 404 }),
      functionPath: "",
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: ctx.passThroughOnException.bind(ctx),
    };

    return requestHandler(context);
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
