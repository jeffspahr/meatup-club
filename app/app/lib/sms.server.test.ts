import { describe, expect, it } from "vitest";
import { normalizePhoneNumber, parseSmsReply } from "./sms.server";

describe("normalizePhoneNumber", () => {
  it("normalizes US 10-digit numbers", () => {
    expect(normalizePhoneNumber("555-123-4567")).toBe("+15551234567");
  });

  it("normalizes US 11-digit numbers", () => {
    expect(normalizePhoneNumber("1 (415) 555-0000")).toBe("+14155550000");
  });

  it("accepts E.164 numbers", () => {
    expect(normalizePhoneNumber("+14155551234")).toBe("+14155551234");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhoneNumber("123")).toBeNull();
  });
});

describe("parseSmsReply", () => {
  it("parses yes/no replies", () => {
    expect(parseSmsReply("YES")).toBe("yes");
    expect(parseSmsReply("n")).toBe("no");
    expect(parseSmsReply("yes please")).toBe("yes");
    expect(parseSmsReply("No, thanks")).toBe("no");
  });

  it("parses opt-out keywords", () => {
    expect(parseSmsReply("STOP")).toBe("opt_out");
  });

  it("returns null for unknown text", () => {
    expect(parseSmsReply("maybe")).toBeNull();
  });
});
