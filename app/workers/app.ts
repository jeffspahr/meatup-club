import { createRequestHandler } from "@react-router/cloudflare";

declare global {
  interface CloudflareEnvironment extends Env {}
}

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
