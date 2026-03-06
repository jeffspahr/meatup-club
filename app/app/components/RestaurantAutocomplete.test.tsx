import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { RestaurantAutocomplete } from "./RestaurantAutocomplete";

const samplePlaceDetails = {
  placeId: "place-1",
  name: "Prime Steakhouse",
  address: "123 Main St",
  phone: "+1 919-555-0100",
  website: "https://prime.example.com",
  googleMapsUrl: "https://maps.example.com/prime",
  rating: 4.8,
  ratingCount: 240,
  priceLevel: 4,
  photoUrl: "/api/places/photo?name=prime",
  cuisine: "Steakhouse",
};

function TestHarness({ onSelect = vi.fn() }: { onSelect?: (details: typeof samplePlaceDetails) => void }) {
  const [value, setValue] = useState("");

  return (
    <RestaurantAutocomplete
      value={value}
      onChange={setValue}
      onSelect={onSelect}
    />
  );
}

describe("RestaurantAutocomplete", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("searches after debounce and selects a suggestion with the keyboard", async () => {
    const onSelect = vi.fn();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          places: [
            {
              id: "place-1",
              displayName: { text: "Prime Steakhouse" },
              formattedAddress: "123 Main St",
            },
          ],
        }),
      } as never)
      .mockResolvedValueOnce({
        json: async () => samplePlaceDetails,
      } as never);

    render(<TestHarness onSelect={onSelect} />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");

    fireEvent.change(input, { target: { value: "pr" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/places/search?input=pr");
    expect(screen.getByText("Prime Steakhouse")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(onSelect).toHaveBeenCalledWith(samplePlaceDetails);
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/places/details?placeId=place-1");
    expect(input).toHaveValue("Prime Steakhouse");
  });

  it("skips short searches and shows an empty-state message when no places are found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ places: [] }),
    } as never);

    render(<TestHarness />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");
    fireEvent.change(input, { target: { value: "a" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "zz" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("No restaurants found. Try a different search term.")).toBeInTheDocument();
  });

  it("closes the dropdown when the user clicks outside the component", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        places: [
          {
            id: "place-2",
            displayName: { text: "Oak & Ember" },
            formattedAddress: "456 Oak Ave",
          },
        ],
      }),
    } as never);

    render(
      <div>
        <TestHarness />
        <button type="button">Outside</button>
      </div>
    );

    const input = screen.getByPlaceholderText("Start typing restaurant name...");
    fireEvent.change(input, { target: { value: "oa" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("Oak & Ember")).toBeInTheDocument();

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    });

    expect(screen.queryByText("Oak & Ember")).not.toBeInTheDocument();
  });
});
