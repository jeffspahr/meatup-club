import { afterEach, describe, expect, it, vi } from "vitest";
import { logErrorEvent, logWarningEvent } from "./observability.server";

describe("logErrorEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a searchable event without the potentially sensitive error message", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sensitiveMessage = "provider rejected member@example.com";

    logErrorEvent("worker_fetch_failed", new TypeError(sensitiveMessage));

    expect(consoleError).toHaveBeenCalledWith({
      event: "worker_fetch_failed",
      errorName: "TypeError",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sensitiveMessage);
  });

  it("normalizes non-Error throws without stringifying their contents", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logErrorEvent("scheduled_task_failed", { email: "member@example.com" });

    expect(consoleError).toHaveBeenCalledWith({
      event: "scheduled_task_failed",
      errorName: "NonErrorThrown",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("member@example.com");
  });

  it("logs reported failures and warnings without provider details", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logErrorEvent("resend_request_rejected");
    logWarningEvent("twilio_credentials_missing");

    expect(consoleError).toHaveBeenCalledWith({
      event: "resend_request_rejected",
      errorName: "ReportedFailure",
    });
    expect(consoleWarn).toHaveBeenCalledWith({
      event: "twilio_credentials_missing",
      errorName: "ReportedFailure",
    });
  });
});
