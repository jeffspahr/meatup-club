import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestaurantAutocomplete } from "./RestaurantAutocomplete";

const place = {
  id: "place-123",
  displayName: { text: "Prime Steakhouse" },
  formattedAddress: "123 Main Street",
};

const details = {
  placeId: "place-123",
  name: "Prime Steakhouse",
  address: "123 Main Street",
  phone: "+15551234567",
  website: "https://prime.example.com",
  googleMapsUrl: "https://maps.example.com/prime",
  rating: 4.8,
  ratingCount: 120,
  priceLevel: 4,
  photoUrl: "/api/places/photo?name=prime",
  cuisine: "Steakhouse",
};

function renderAutocomplete(onSelect = vi.fn()) {
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <RestaurantAutocomplete
        inputId="restaurant"
        value={value}
        onChange={setValue}
        onSelect={onSelect}
      />
    );
  }

  render(<Harness />);
  return { onSelect };
}

describe("RestaurantAutocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debounces search and selects production place details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ places: [place] }))
      .mockResolvedValueOnce(Response.json(details));
    vi.stubGlobal("fetch", fetchMock);
    const { onSelect } = renderAutocomplete();

    fireEvent.change(screen.getByPlaceholderText("Start typing restaurant name..."), {
      target: { value: "prime" },
    });

    const suggestion = await screen.findByRole("button", {
      name: /Prime Steakhouse.*123 Main Street/,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/places/search?input=prime");

    fireEvent.click(suggestion);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(details));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/places/details?placeId=place-123"
    );
    expect(screen.getByDisplayValue("Prime Steakhouse")).toBeInTheDocument();
  });

  it("does not search until at least two characters are entered", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAutocomplete();

    fireEvent.change(screen.getByPlaceholderText("Start typing restaurant name..."), {
      target: { value: "p" },
    });

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("No restaurants found. Try a different search term.")).not.toBeInTheDocument();
  });

  it("supports keyboard selection of search results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ places: [place] }))
      .mockResolvedValueOnce(Response.json(details));
    vi.stubGlobal("fetch", fetchMock);
    const { onSelect } = renderAutocomplete();
    const input = screen.getByPlaceholderText("Start typing restaurant name...");

    fireEvent.change(input, { target: { value: "prime" } });
    await screen.findByRole("button", { name: /Prime Steakhouse/ });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(details));
  });
});
