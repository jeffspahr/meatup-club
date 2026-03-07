import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantsPage, { loader } from "./dashboard.restaurants";
import type { Route } from "./+types/dashboard.restaurants";
import { requireActiveUser } from "../lib/auth.server";
import { normalizeRestaurantPhotoUrl } from "../lib/restaurant-photo-url";

const submitSpy = vi.fn();
const modalSubmitSpy = vi.fn();
const modalCloseSpy = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useSubmit: () => submitSpy,
  };
});

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/restaurant-photo-url", () => ({
  normalizeRestaurantPhotoUrl: vi.fn((photoUrl: string | null, requestUrl: string) =>
    photoUrl ? `${requestUrl}::${photoUrl}` : null
  ),
}));

vi.mock("../components/AddRestaurantModal", () => ({
  AddRestaurantModal: ({
    isOpen,
    onClose,
    onSubmit,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (details: Record<string, unknown>) => void;
  }) =>
    isOpen ? (
      <div>
        <button
          type="button"
          onClick={() => {
            modalSubmitSpy();
            onSubmit({
              name: "Prime Steakhouse",
              address: "123 Main St",
              cuisine: "Steakhouse",
              website: "https://prime.example.com",
              placeId: "place-123",
              rating: 4.8,
              ratingCount: 321,
              priceLevel: 4,
              phone: "555-1234",
              photoUrl: "https://images.example.com/prime.jpg",
              googleMapsUrl: "https://maps.example.com/prime",
              openingHours: '["Mon: 5pm-10pm"]',
            });
          }}
        >
          Modal submit
        </button>
        <button
          type="button"
          onClick={() => {
            modalCloseSpy();
            onClose();
          }}
        >
          Modal close
        </button>
      </div>
    ) : null,
}));

type MockDbOptions = {
  suggestions?: Array<Record<string, unknown>>;
};

function createMockDb({ suggestions = [] }: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const allForArgs = async () => {
      if (normalizedSql.includes("FROM restaurants r")) {
        return { results: suggestions };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    return {
      all: () => allForArgs(),
    };
  });

  return { prepare };
}

describe("dashboard.restaurants loader and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockReset();
    modalSubmitSpy.mockReset();
    modalCloseSpy.mockReset();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User",
    } as never);
  });

  it("loads restaurants and normalizes photo URLs against the request URL", async () => {
    const db = createMockDb({
      suggestions: [
        {
          id: 1,
          created_by: 123,
          name: "Prime Steakhouse",
          photo_url: "https://images.example.com/prime.jpg",
          suggested_by_name: "User",
          suggested_by_email: "user@example.com",
        },
      ],
    });

    const result = await loader({
      request: new Request("https://meatup.club/dashboard/restaurants"),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(requireActiveUser).toHaveBeenCalled();
    expect(normalizeRestaurantPhotoUrl).toHaveBeenCalledWith(
      "https://images.example.com/prime.jpg",
      "https://meatup.club/dashboard/restaurants"
    );
    expect(result.currentUser).toEqual({ id: 123, isAdmin: false });
    expect(result.suggestions[0]).toEqual(
      expect.objectContaining({
        id: 1,
        name: "Prime Steakhouse",
        photo_url:
          "https://meatup.club/dashboard/restaurants::https://images.example.com/prime.jpg",
      })
    );
  });

  it("renders the empty state, error feedback, and modal open/close flow", () => {
    render(
      <RestaurantsPage
        {...(({
          loaderData: {
          suggestions: [],
          currentUser: { id: 123, isAdmin: false },
          },
          actionData: { error: "Something went wrong." },
        } as unknown) as Route.ComponentProps)}
      />
    );

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByText("No restaurants yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\+ Add Restaurant/i }));
    expect(screen.getByRole("button", { name: "Modal submit" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Modal close" }));
    expect(modalCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Modal submit" })).not.toBeInTheDocument();
  });

  it("submits restaurant suggestions from the modal and delete requests for owned restaurants", () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    render(
      <RestaurantsPage
        {...(({
          loaderData: {
            suggestions: [
              {
                id: 55,
                created_by: 123,
                name: "Prime Steakhouse",
                address: "123 Main St",
                cuisine: "Steakhouse",
                url: "https://prime.example.com",
                created_at: "2026-03-01",
                suggested_by_name: "User",
                suggested_by_email: "user@example.com",
                google_place_id: "place-123",
                google_rating: 4.8,
                rating_count: 321,
                price_level: 4,
                phone_number: "555-1234",
                reservation_url: null,
                menu_url: null,
                photo_url: "https://images.example.com/prime.jpg",
                google_maps_url: "https://maps.example.com/prime",
                opening_hours: '["Monday: 5pm-10pm", "Tuesday: 5pm-10pm"]',
              },
            ],
            currentUser: { id: 123, isAdmin: false },
          },
          actionData: undefined,
        } as unknown) as Route.ComponentProps)}
      />
    );

    expect(screen.getByText("Prime Steakhouse")).toBeInTheDocument();
    expect(screen.getByText("Steakhouse")).toBeInTheDocument();
    expect(screen.getByText("$$$$")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on Google Maps →" })).toHaveAttribute(
      "href",
      "https://maps.example.com/prime"
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Add Restaurant/i }));
    fireEvent.click(screen.getByRole("button", { name: "Modal submit" }));

    expect(modalSubmitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect((submitSpy.mock.calls[0][0] as FormData).get("_action")).toBe("suggest");
    expect((submitSpy.mock.calls[0][0] as FormData).get("name")).toBe("Prime Steakhouse");
    expect((submitSpy.mock.calls[0][0] as FormData).get("google_place_id")).toBe("place-123");
    expect((submitSpy.mock.calls[0][0] as FormData).get("opening_hours")).toBe('["Mon: 5pm-10pm"]');

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to delete "Prime Steakhouse"? This action cannot be undone.'
    );
    expect((submitSpy.mock.calls[1][0] as FormData).get("_action")).toBe("delete");
    expect((submitSpy.mock.calls[1][0] as FormData).get("suggestion_id")).toBe("55");
  });
});
