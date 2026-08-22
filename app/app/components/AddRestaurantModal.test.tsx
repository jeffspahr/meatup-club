import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddRestaurantModal } from "./AddRestaurantModal";

const placeDetails = vi.hoisted(() => ({
  placeId: "ChIJ12345",
  name: "Prime Steakhouse",
  address: "123 Main St",
  phone: "919-555-0100",
  website: "https://prime.example.com",
  googleMapsUrl: "https://maps.example.com/prime",
  rating: 4.8,
  ratingCount: 240,
  priceLevel: 4,
  photoUrl: "https://images.example.com/prime.jpg",
  cuisine: "Steakhouse",
  openingHours: "5 PM–10 PM",
}));

vi.mock("./RestaurantAutocomplete", () => ({
  RestaurantAutocomplete: ({ value, onChange, onSelect }: any) => (
    <div>
      <input
        aria-label="Restaurant search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => onSelect(placeDetails)}>
        Choose Prime Steakhouse
      </button>
    </div>
  ),
}));

describe("AddRestaurantModal", () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only while open and uses the supplied title", () => {
    const { rerender } = render(
      <AddRestaurantModal
        isOpen={false}
        onClose={onClose}
        onSubmit={onSubmit}
        title="Nominate a restaurant"
      />
    );

    expect(screen.queryByText("Nominate a restaurant")).not.toBeInTheDocument();

    rerender(
      <AddRestaurantModal
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        title="Nominate a restaurant"
      />
    );

    expect(screen.getByText("Nominate a restaurant")).toBeInTheDocument();
  });

  it("requires a selected place rather than free-form text", () => {
    render(
      <AddRestaurantModal isOpen onClose={onClose} onSubmit={onSubmit} />
    );

    const submitButton = screen.getByRole("button", { name: "Add Restaurant" });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Restaurant search"), {
      target: { value: "Prime" },
    });

    expect(submitButton).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("previews and submits the selected place, then resets modal state", () => {
    render(
      <AddRestaurantModal isOpen onClose={onClose} onSubmit={onSubmit} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Choose Prime Steakhouse" })
    );

    expect(screen.getByText("Restaurant Found")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("Cuisine: Steakhouse")).toBeInTheDocument();
    expect(screen.getByAltText("Prime Steakhouse")).toHaveAttribute(
      "src",
      placeDetails.photoUrl
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Restaurant" }));

    expect(onSubmit).toHaveBeenCalledWith(placeDetails);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Restaurant Found")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Restaurant search")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add Restaurant" })).toBeDisabled();
  });

  it.each(["Close", "Cancel"])(
    "clears a selection when closed with %s",
    (buttonName) => {
      render(
        <AddRestaurantModal isOpen onClose={onClose} onSubmit={onSubmit} />
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Choose Prime Steakhouse" })
      );

      fireEvent.click(screen.getByRole("button", { name: buttonName }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.queryByText("Restaurant Found")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Restaurant search")).toHaveValue("");
    }
  );
});
