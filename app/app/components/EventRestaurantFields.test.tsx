import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EventRestaurantFields } from "./EventRestaurantFields";

const selectedPlace = {
  placeId: "place_123",
  name: "Prime Steakhouse",
  address: "123 Main St",
  phone: "",
  website: "",
  googleMapsUrl: "",
  rating: 4.8,
  ratingCount: 120,
  priceLevel: 4,
  photoUrl: "",
  cuisine: "Steakhouse",
};

vi.mock("./RestaurantAutocomplete", () => ({
  RestaurantAutocomplete: ({
    inputId,
    value,
    onChange,
    onSelect,
  }: {
    inputId: string;
    value: string;
    onChange: (value: string) => void;
    onSelect: (place: typeof selectedPlace) => void;
  }) => (
    <div>
      <input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => onSelect(selectedPlace)}>
        Select Prime
      </button>
    </div>
  ),
}));

function Harness({
  initialName = "",
  initialAddress = "",
}: {
  initialName?: string;
  initialAddress?: string;
}) {
  const [restaurantName, setRestaurantName] = useState(initialName);
  const [restaurantAddress, setRestaurantAddress] = useState(initialAddress);

  return (
    <EventRestaurantFields
      restaurantName={restaurantName}
      restaurantAddress={restaurantAddress}
      onRestaurantNameChange={setRestaurantName}
      onRestaurantAddressChange={setRestaurantAddress}
    />
  );
}

describe("EventRestaurantFields", () => {
  it("populates the selected restaurant and lets the user clear it", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Prime" }));

    expect(screen.getAllByDisplayValue("Prime Steakhouse")).toHaveLength(2);
    expect(screen.getByDisplayValue("123 Main St")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByLabelText("Restaurant *")).toHaveValue("");
    expect(screen.queryByDisplayValue("123 Main St")).not.toBeInTheDocument();
  });

  it("clears the selected hidden values when the search text no longer matches", () => {
    render(<Harness initialName="Prime Steakhouse" initialAddress="123 Main St" />);

    const autocompleteInput = screen.getAllByDisplayValue("Prime Steakhouse")[0];
    fireEvent.change(autocompleteInput, { target: { value: "River Grill" } });

    expect(screen.getByLabelText("Restaurant *")).toHaveValue("");
    expect(screen.queryByDisplayValue("123 Main St")).not.toBeInTheDocument();
  });
});
