import { describe, expect, it } from "vitest";
import { getCanonicalRedirectUrl } from "./canonical-host";

describe("getCanonicalRedirectUrl", () => {
  it("redirects http apex requests to https apex", () => {
    expect(getCanonicalRedirectUrl("http://meatup.club/login?next=%2Fdashboard")).toBe(
      "https://meatup.club/login?next=%2Fdashboard"
    );
  });

  it("redirects https www requests to the https apex host", () => {
    expect(
      getCanonicalRedirectUrl("https://www.meatup.club/auth/google/callback?code=123&state=abc")
    ).toBe("https://meatup.club/auth/google/callback?code=123&state=abc");
  });

  it("does not redirect canonical https apex requests", () => {
    expect(getCanonicalRedirectUrl("https://meatup.club/dashboard")).toBeNull();
  });
});
