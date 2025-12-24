import { createRequestHandler } from "react-router";

declare global {
  interface CloudflareEnvironment extends Env {}
}

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const requestHandler = createRequestHandler(
  // @ts-expect-error - virtual module provided by React Router
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

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
