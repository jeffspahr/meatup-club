// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wranglerConfig = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

describe("Wrangler observability policy", () => {
  it("persists all structured logs without retaining request URLs", () => {
    expect(wranglerConfig).toMatch(
      /\[observability\]\s+enabled = true\s+head_sampling_rate = 1/
    );
    expect(wranglerConfig).toMatch(
      /\[observability\.logs\]\s+enabled = true\s+invocation_logs = false/
    );
  });
});
