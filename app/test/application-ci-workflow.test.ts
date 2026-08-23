// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const applicationCi = readFileSync(
  new URL("../../.github/workflows/test.yml", import.meta.url),
  "utf8"
);
const deployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8"
);

function jobBlock(job: string, nextJob?: string) {
  const startMarker = `  ${job}:\n`;
  const start = applicationCi.indexOf(startMarker);
  const end = nextJob
    ? applicationCi.indexOf(`  ${nextJob}:\n`, start + startMarker.length)
    : applicationCi.length;

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return applicationCi.slice(start, end);
}

describe("Application CI workflow", () => {
  it("runs quality and browser verification in independent descriptive jobs", () => {
    const quality = jobBlock("quality", "browser");
    const browser = jobBlock("browser", "verify");

    expect(quality).toContain("name: Quality, unit tests, and build");
    expect(quality).toContain("run: npm run lint");
    expect(quality).toContain("run: npm run test:secrets");
    expect(quality).toContain("run: npm run typecheck");
    expect(quality).toContain("run: npm run test:coverage");
    expect(quality).toContain("run: npm run test:d1");
    expect(quality).toContain("run: npm run build");
    expect(quality).not.toContain("playwright install");
    expect(quality).not.toContain("run: npm run test:e2e");

    expect(browser).toContain("name: Browser journeys (Chromium + iPhone WebKit)");
    expect(browser).toContain("run: npx playwright install --with-deps chromium webkit");
    expect(browser).toContain("run: npm run test:e2e");
    expect(browser).not.toContain("run: npm run test:coverage");
    expect(browser).not.toContain("run: npm run build");
  });

  it("preserves the required aggregate check and fails it unless both lanes pass", () => {
    const verify = jobBlock("verify");

    expect(verify).toContain("name: Verify application");
    expect(verify).toContain("if: ${{ always() }}");
    expect(verify).toMatch(/needs:\s+\- quality\s+\- browser/);
    expect(verify).toContain("QUALITY_RESULT: ${{ needs.quality.result }}");
    expect(verify).toContain("BROWSER_RESULT: ${{ needs.browser.result }}");
    expect(verify).toContain("exit 1");
  });

  it("keeps production deployment gated on successful main Application CI", () => {
    expect(deployWorkflow).toContain("- Application CI");
    expect(deployWorkflow).toContain("github.event.workflow_run.event == 'push'");
    expect(deployWorkflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(deployWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(deployWorkflow).toContain("ref: ${{ github.event.workflow_run.head_sha }}");
  });
});
