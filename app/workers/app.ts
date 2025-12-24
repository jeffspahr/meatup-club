import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/default/index.js";

declare global {
  interface CloudflareEnvironment extends Env {}
}

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const requestHandler = createRequestHandler(build, "production");

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
