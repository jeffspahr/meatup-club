import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;
const originalSessionSecret = process.env.SESSION_SECRET;

async function importFreshSessionModule() {
  vi.resetModules();
  return import("./session.server");
}

describe("session.server", () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }

    vi.resetModules();
  });

  it("uses the test fallback secret when SESSION_SECRET is missing in test", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.SESSION_SECRET;

    const sessionModule = await importFreshSessionModule();
    const session = await sessionModule.getSession();
    const cookieHeader = await sessionModule.commitSession(session);

    expect(cookieHeader).toContain("__session=");
    expect(cookieHeader).not.toContain("Secure");
  });

  it("uses secure cookies in production when a session secret is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "production-session-secret";

    const sessionModule = await importFreshSessionModule();
    const session = await sessionModule.getSession();
    const cookieHeader = await sessionModule.commitSession(session);

    expect(cookieHeader).toContain("__session=");
    expect(cookieHeader).toContain("Secure");
  });

  it("throws when SESSION_SECRET is missing outside the test environment", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;

    await expect(importFreshSessionModule()).rejects.toThrow("SESSION_SECRET must be configured");
  });
});
