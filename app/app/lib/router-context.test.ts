import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { createLoadContext, getCloudflareContext } from "./router-context";

describe("router context", () => {
  it("preserves the per-request Cloudflare bindings", () => {
    const cloudflare = {
      env: { DB: { marker: "db" } },
      ctx: { waitUntil() {} },
    };

    const context = createLoadContext(cloudflare as never);

    expect(getCloudflareContext(context)).toBe(cloudflare);
  });

  it("fails closed when Cloudflare bindings were not provided", () => {
    const context = new RouterContextProvider();

    expect(() => getCloudflareContext(context)).toThrow(
      "No value found for context"
    );
  });
});
