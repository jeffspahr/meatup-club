import { describe, expect, it } from "vitest";
import { parseCityState } from "./addressUtils";

describe("parseCityState", () => {
  it("parses a typical US Google-formatted address", () => {
    expect(parseCityState("123 Main St, New York, NY 10001, USA")).toEqual({
      city: "New York",
      state: "NY",
    });
  });

  it("parses an address with ZIP+4", () => {
    expect(parseCityState("456 Elm Ave, San Francisco, CA 94110-1234, USA")).toEqual({
      city: "San Francisco",
      state: "CA",
    });
  });

  it("parses an address with no ZIP", () => {
    expect(parseCityState("789 Park Pl, Brooklyn, NY")).toEqual({
      city: "Brooklyn",
      state: "NY",
    });
  });

  it("parses an address with an extra suite/apt component", () => {
    expect(parseCityState("789 Park Pl, Apt 4B, Newark, NJ 07102, USA")).toEqual({
      city: "Newark",
      state: "NJ",
    });
  });

  it("returns null for null/empty input", () => {
    expect(parseCityState(null)).toBeNull();
    expect(parseCityState(undefined)).toBeNull();
    expect(parseCityState("")).toBeNull();
  });

  it("returns null when no recognizable state token is present", () => {
    expect(parseCityState("Some Place, London, UK")).toBeNull();
  });

  it("returns null when the state token has no preceding city", () => {
    expect(parseCityState("NY 10001")).toBeNull();
  });
});
