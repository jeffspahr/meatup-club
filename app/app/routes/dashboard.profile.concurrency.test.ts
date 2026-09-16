// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness, type SqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "../lib/router-context";
import { requireActiveUser, type AuthUser } from "../lib/auth.server";
import { action } from "./dashboard.profile";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("profile SMS concurrency with the canonical schema", () => {
  let harness: SqliteD1Harness;
  let userId: number;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    userId = harness.insert(`INSERT INTO users (email, status, phone_number, sms_opt_in)
      VALUES ('member@example.com', 'active', '+15551234567', 0)`);
    vi.mocked(requireActiveUser).mockResolvedValue(
      harness.get<AuthUser>("SELECT * FROM users WHERE id = ?", userId)!
    );
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.clearAllMocks();
  });

  async function saveSms(wantsSms: boolean) {
    return action({
      request: new Request("https://meatup.club/dashboard/profile", {
        method: "POST",
        body: new URLSearchParams({
          _action: "update_sms",
          phone_number: "+15551234567",
          ...(wantsSms ? { sms_opt_in: "on" } : {}),
        }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never), params: {},
    } as never);
  }

  it.each([true, false])("preserves a concurrent STOP when the stale form requests consent=%s", async (wantsSms) => {
    // The profile action already authenticated against the earlier account snapshot.
    harness.sqlite.exec(`UPDATE users SET sms_opt_in = 0,
      sms_opt_out_at = '2026-09-16 12:00:00', sms_opt_out_source = 'sms'`);
    const before = harness.get("SELECT * FROM users WHERE id = ?", userId);

    expect(await saveSms(wantsSms)).toEqual({ error: "SMS preferences changed. Please refresh and try again." });
    expect(harness.get("SELECT * FROM users WHERE id = ?", userId)).toEqual(before);
    expect(harness.all("SELECT * FROM sms_consent_events")).toEqual([]);
  });

  it("preserves a concurrent START instead of disabling the newly enabled number", async () => {
    harness.sqlite.exec("UPDATE users SET sms_opt_in = 1");
    expect(await saveSms(false)).toEqual({ error: "SMS preferences changed. Please refresh and try again." });
    expect(harness.get("SELECT sms_opt_in, sms_opt_out_at FROM users WHERE id = ?", userId))
      .toEqual({ sms_opt_in: 1, sms_opt_out_at: null });
    expect(harness.all("SELECT * FROM sms_consent_events")).toEqual([]);
  });

  it("preserves a concurrent phone edit and does not record consent for the stale number", async () => {
    harness.sqlite.exec("UPDATE users SET phone_number = '+15557654321'");
    expect(await saveSms(true)).toEqual({ error: "SMS preferences changed. Please refresh and try again." });
    expect(harness.get("SELECT phone_number, sms_opt_in FROM users WHERE id = ?", userId))
      .toEqual({ phone_number: "+15557654321", sms_opt_in: 0 });
    expect(harness.all("SELECT * FROM sms_consent_events")).toEqual([]);
  });

  it("saves an ordinary opt-out together with its consent evidence", async () => {
    harness.sqlite.exec("UPDATE users SET sms_opt_in = 1");
    vi.mocked(requireActiveUser).mockResolvedValue(
      harness.get<AuthUser>("SELECT * FROM users WHERE id = ?", userId)!
    );
    expect(await saveSms(false)).toEqual({ success: "SMS preferences updated successfully" });
    expect(harness.get("SELECT sms_opt_in, sms_opt_out_source FROM users WHERE id = ?", userId))
      .toEqual({ sms_opt_in: 0, sms_opt_out_source: "profile" });
    expect(harness.all("SELECT event_type, source FROM sms_consent_events"))
      .toEqual([{ event_type: "opt_out", source: "profile" }]);
  });

  it("saves an ordinary opt-in together with its consent evidence", async () => {
    expect(await saveSms(true)).toEqual({ success: "SMS preferences updated successfully" });
    expect(harness.get("SELECT sms_opt_in, sms_opt_out_at, sms_opt_out_source FROM users WHERE id = ?", userId))
      .toEqual({ sms_opt_in: 1, sms_opt_out_at: null, sms_opt_out_source: null });
    expect(harness.all("SELECT user_id, phone_number, event_type, source FROM sms_consent_events"))
      .toEqual([{ user_id: userId, phone_number: "+15551234567", event_type: "opt_in", source: "profile" }]);
  });

  it("rolls back preferences when recording consent evidence fails", async () => {
    harness.sqlite.exec(`CREATE TRIGGER reject_consent BEFORE INSERT ON sms_consent_events
      BEGIN SELECT RAISE(ABORT, 'consent storage failure'); END`);
    await expect(saveSms(true)).rejects.toThrow("consent storage failure");
    expect(harness.get("SELECT sms_opt_in FROM users WHERE id = ?", userId)).toEqual({ sms_opt_in: 0 });
    expect(harness.all("SELECT * FROM sms_consent_events")).toEqual([]);
  });
});
