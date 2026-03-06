import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddRestaurantModal } from "./AddRestaurantModal";

const selectedPlace = {
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

vi.mock("./RestaurantAutocomplete", () => ({
  RestaurantAutocomplete: ({
    onSelect,
    onChange,
    value,
  }: {
    onSelect: (details: typeof selectedPlace) => void;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <div>
      <div data-testid="autocomplete-value">{value}</div>
      <button
        type="button"
        onClick={() => {
          onChange(selectedPlace.name);
          onSelect(selectedPlace);
        }}
      >
        Select Prime Steakhouse
      </button>
    </div>
  ),
}));

describe("AddRestaurantModal", () => {
  it("renders nothing when closed", () => {
    render(
      <AddRestaurantModal
        isOpen={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByText("Add a Restaurant")).not.toBeInTheDocument();
  });

  it("shows the selected restaurant details and submits them", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AddRestaurantModal
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const submitButton = screen.getByRole("button", { name: "Add Restaurant" });
    expect(submitButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select Prime Steakhouse" }));

    expect(screen.getByText("Restaurant Found")).toBeInTheDocument();
    expect(screen.getAllByText("Prime Steakhouse")).toHaveLength(2);
    expect(screen.getByText("Cuisine: Steakhouse")).toBeInTheDocument();
    expect(screen.getByTestId("autocomplete-value")).toHaveTextContent("Prime Steakhouse");
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(selectedPlace);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Restaurant Found")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Restaurant" })).toBeDisabled();
  });

  it("clears the selected restaurant when the modal is cancelled", () => {
    const onClose = vi.fn();

    render(
      <AddRestaurantModal
        isOpen
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Prime Steakhouse" }));
    expect(screen.getByText("Restaurant Found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Restaurant Found")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Restaurant" })).toBeDisabled();
    expect(screen.getByTestId("autocomplete-value")).toHaveTextContent("");
  });
});
