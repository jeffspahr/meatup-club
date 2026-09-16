import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateEventForm } from "./CreateEventForm";
import { EMPTY_EVENT_FORM } from "../lib/events-shared";

const place = {
  placeId: "prime-test",
  name: "Prime Test Steakhouse",
  address: "123 Test Street",
};

function FormHarness() {
  const [formData, setFormData] = useState(EMPTY_EVENT_FORM);
  return <CreateEventForm formData={formData} onChange={setFormData} />;
}

function renderForm() {
  const router = createMemoryRouter([{ path: "/", element: <FormHarness /> }]);
  return render(<RouterProvider router={router} />);
}

async function selectRestaurant() {
  fireEvent.change(screen.getByLabelText("Restaurant *"), { target: { value: "Prime" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Prime Test Steakhouse/ }));
  });
}

describe("CreateEventForm restaurant selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("/details?") ? place : {
        places: [{ id: place.placeId, displayName: { text: place.name }, formattedAddress: place.address }],
      }
    ))));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the selected name and address in the submitted form alongside the date and time", async () => {
    const { container } = renderForm();
    fireEvent.change(screen.getByLabelText("Event Date *"), { target: { value: "2099-04-20" } });
    fireEvent.change(screen.getByLabelText("Event Time"), { target: { value: "19:30" } });
    await selectRestaurant();

    expect(screen.getByLabelText("Address")).toHaveValue(place.address);
    const form = new FormData(container.querySelector("form")!);
    expect(Object.fromEntries(form)).toMatchObject({
      restaurant_name: place.name,
      restaurant_address: place.address,
      event_date: "2099-04-20",
      event_time: "19:30",
      send_invites: "true",
    });
  });

  it("keeps replacement search text while invalidating and then reselecting the old restaurant", async () => {
    const { container } = renderForm();
    await selectRestaurant();
    fireEvent.change(screen.getByLabelText("Restaurant *"), { target: { value: "Prime replacement" } });
    expect(screen.getByLabelText("Restaurant *")).toHaveValue("Prime replacement");
    expect(new FormData(container.querySelector("form")!).get("restaurant_name")).toBe("");
    expect(screen.queryByLabelText("Address")).not.toBeInTheDocument();

    await selectRestaurant();
    expect(screen.getByLabelText("Address")).toHaveValue(place.address);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText("Restaurant *")).toHaveValue("");
    expect(new FormData(container.querySelector("form")!).get("restaurant_name")).toBe("");
  });
});
