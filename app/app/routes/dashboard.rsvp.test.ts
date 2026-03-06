import { describe, expect, it } from "vitest";
import { action, loader } from "./dashboard.rsvp";

describe("dashboard.rsvp route", () => {
  it("redirects legacy loader requests to the events page", async () => {
    const response = await loader({
      request: new Request("http://localhost/dashboard/rsvp"),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard/events");
  });

  it("redirects legacy form posts to the events page", async () => {
    const response = await action({
      request: new Request("http://localhost/dashboard/rsvp", { method: "POST" }),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard/events");
  });
});
