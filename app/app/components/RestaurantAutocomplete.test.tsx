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
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function deferredResponse() {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((done) => { resolve = done; });
    return { promise, resolve };
  }

  const prime = { id: "place-1", displayName: { text: "Prime Steakhouse" }, formattedAddress: "123 Main St" };
  const oak = { id: "place-2", displayName: { text: "Oak & Ember" }, formattedAddress: "456 Oak Ave" };

  it("ignores an older search that finishes after the current search", async () => {
    const oldSearch = deferredResponse();
    global.fetch = vi.fn().mockReturnValueOnce(oldSearch.promise)
      .mockResolvedValueOnce(Response.json({ places: [oak] }));
    render(<TestHarness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "pr" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(input, { target: { value: "oak" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => { oldSearch.resolve(Response.json({ places: [prime] })); });
    expect(screen.getByRole("button", { name: /Oak & Ember/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prime Steakhouse/ })).not.toBeInTheDocument();
  });

  it("does not reopen results after the search text is cleared", async () => {
    const search = deferredResponse();
    global.fetch = vi.fn().mockReturnValue(search.promise);
    render(<TestHarness />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "pr" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    await act(async () => { search.resolve(Response.json({ places: [prime] })); });
    expect(screen.queryByRole("button", { name: /Prime Steakhouse/ })).not.toBeInTheDocument();
  });

  it("does not overwrite newer input with a pending selection", async () => {
    const details = deferredResponse();
    const onSelect = vi.fn();
    global.fetch = vi.fn().mockResolvedValueOnce(Response.json({ places: [prime] }))
      .mockReturnValueOnce(details.promise);
    render(<TestHarness onSelect={onSelect} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "pr" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.click(screen.getByRole("button", { name: /Prime Steakhouse/ }));
    fireEvent.change(input, { target: { value: "oak" } });
    await act(async () => { details.resolve(Response.json(samplePlaceDetails)); });
    expect(input).toHaveValue("oak");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not commit a failed HTTP details response and permits retry", async () => {
    const onSelect = vi.fn();
    global.fetch = vi.fn().mockResolvedValueOnce(Response.json({ places: [prime] }))
      .mockResolvedValueOnce(Response.json({ error: "Rate limited" }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ places: [prime] }))
      .mockResolvedValueOnce(Response.json(samplePlaceDetails));
    render(<TestHarness onSelect={onSelect} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "pr" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Prime Steakhouse/ })); });
    expect(input).toHaveValue("pr");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "prime" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Prime Steakhouse/ })); });
    expect(onSelect).toHaveBeenCalledWith(samplePlaceDetails);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("ignores a detail response after unmount", async () => {
    const details = deferredResponse();
    const onSelect = vi.fn();
    global.fetch = vi.fn().mockResolvedValueOnce(Response.json({ places: [prime] }))
      .mockReturnValueOnce(details.promise);
    const { unmount } = render(<TestHarness onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "pr" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.click(screen.getByRole("button", { name: /Prime Steakhouse/ }));
    unmount();
    await act(async () => { details.resolve(Response.json(samplePlaceDetails)); });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps HTTP search errors out of the no-results state", async () => {
    global.fetch = vi.fn().mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    render(<TestHarness />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "pr" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(screen.queryByText("No restaurants found. Try a different search term.")).not.toBeInTheDocument();
  });

  it("resets keyboard selection when a search returns fewer results", async () => {
    const onSelect = vi.fn();
    global.fetch = vi.fn().mockResolvedValueOnce(Response.json({ places: [prime, oak] }))
      .mockResolvedValueOnce(Response.json({ places: [prime] }))
      .mockResolvedValueOnce(Response.json(samplePlaceDetails));
    render(<TestHarness onSelect={onSelect} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "steak" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "prime" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(onSelect).toHaveBeenCalledWith(samplePlaceDetails);
  });

  it("ignores keyboard navigation while the dropdown is closed", () => {
    global.fetch = vi.fn();

    render(<TestHarness />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("searches after debounce and selects a suggestion with the keyboard", async () => {
    const onSelect = vi.fn();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
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
        ok: true,
        json: async () => samplePlaceDetails,
      } as never);

    render(<TestHarness onSelect={onSelect} />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");

    fireEvent.change(input, { target: { value: "pr" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/places/search?input=pr", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText("Prime Steakhouse")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(onSelect).toHaveBeenCalledWith(samplePlaceDetails);
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/places/details?placeId=place-1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(input).toHaveValue("Prime Steakhouse");
  });

  it("supports hover, arrow-up, and escape navigation in the dropdown", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
        json: async () => ({
        places: [
          {
            id: "place-1",
            displayName: { text: "Prime Steakhouse" },
            formattedAddress: "123 Main St",
          },
          {
            id: "place-2",
            displayName: { text: "Oak & Ember" },
            formattedAddress: "456 Oak Ave",
          },
        ],
      }),
    } as never);

    render(<TestHarness />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");
    fireEvent.change(input, { target: { value: "st" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const firstOption = screen.getByRole("button", { name: /Prime Steakhouse/i });
    const secondOption = screen.getByRole("button", { name: /Oak & Ember/i });

    await act(async () => {
      fireEvent.mouseEnter(secondOption);
    });
    expect(secondOption.className).toContain("bg-amber-50");

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowUp" });
    });
    expect(firstOption.className).toContain("bg-amber-50");

    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(screen.queryByText("Oak & Ember")).not.toBeInTheDocument();
  });

  it("skips short searches and shows an empty-state message when no places are found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
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

  it("logs search failures and keeps the dropdown closed", async () => {
    const error = new Error("search failed");
    global.fetch = vi.fn().mockRejectedValue(error);

    render(<TestHarness />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");
    fireEvent.change(input, { target: { value: "pr" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to fetch suggestions:", error);
    expect(screen.queryByText("No restaurants found. Try a different search term.")).not.toBeInTheDocument();
  });

  it("logs details failures when selecting a suggestion with the mouse", async () => {
    const onSelect = vi.fn();
    const error = new Error("details failed");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
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
      .mockRejectedValueOnce(error);

    render(<TestHarness onSelect={onSelect} />);

    const input = screen.getByPlaceholderText("Start typing restaurant name...");
    fireEvent.change(input, { target: { value: "pr" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Prime Steakhouse/i }));
      await Promise.resolve();
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to fetch place details:", error);
    expect(input).toHaveValue("pr");
  });

  it("closes the dropdown when the user clicks outside the component", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
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
