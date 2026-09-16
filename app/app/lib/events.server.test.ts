import { describe, expect, it } from "vitest";
import { parseEventMutationFormData } from "./events.server";

function eventForm(eventDate: string) {
  const form = new FormData();
  form.set("restaurant_name", "Steakhouse");
  form.set("event_date", eventDate);
  return form;
}

describe("event calendar date validation", () => {
  it.each(["2099-02-29", "2100-02-29", "2099-04-31", "2099-13-01", "2099-01-00", "0000-01-01"])("rejects impossible date %s", eventDate => {
    expect(parseEventMutationFormData(eventForm(eventDate))).toEqual({ error: "A valid event date is required." });
  });

  it.each(["2099-02-28", "2096-02-29", "2400-02-29", "2099-12-31"])("accepts actual date %s", eventDate => {
    expect(parseEventMutationFormData(eventForm(eventDate)).value?.eventDate).toBe(eventDate);
  });
});
