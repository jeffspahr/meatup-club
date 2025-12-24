import { createRequestHandler } from "react-router";
import * as build from "../build/server/index.js";

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
    try {
      return requestHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
