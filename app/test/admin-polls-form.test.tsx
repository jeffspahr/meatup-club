import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import AdminPollsPage from "../app/routes/dashboard.admin.polls";

function renderPage(element: React.ReactNode) {
  const router = createMemoryRouter(
    [{ path: "/dashboard/admin/polls", element }],
    { initialEntries: ["/dashboard/admin/polls"] }
  );
  return render(<RouterProvider router={router} />);
}

describe("AdminPollsPage close form", () => {
  it("renders production close-poll selects with leader defaults and override options", () => {
    const { container } = renderPage(
      <AdminPollsPage
          loaderData={{
            activePoll: {
              id: 1,
              title: "Quarterly poll",
              created_at: "2027-01-01T12:00:00Z",
            },
            topRestaurant: {
              id: 10,
              name: "Prime Steakhouse",
              address: "123 Main St",
              vote_count: 5,
            },
            topDate: {
              id: 20,
              suggested_date: "2027-02-01",
              vote_count: 7,
            },
            allRestaurants: [
              { id: 10, name: "Prime Steakhouse", vote_count: 5 },
              { id: 11, name: "Ocean Grill", vote_count: 3 },
            ],
            allDates: [
              { id: 20, suggested_date: "2027-02-01", vote_count: 7 },
              { id: 21, suggested_date: "2027-02-08", vote_count: 5 },
            ],
            closedPolls: [],
          } as any}
          actionData={undefined}
          matches={[] as any}
          params={{}}
      />
    );

    expect(screen.getByRole("heading", { name: "Close Poll" })).toBeInTheDocument();

    const restaurantSelect = container.querySelector(
      'select[name="winning_restaurant_id"]'
    ) as unknown as HTMLSelectElement | null;
    const dateSelect = container.querySelector(
      'select[name="winning_date_id"]'
    ) as unknown as HTMLSelectElement | null;

    expect(restaurantSelect).not.toBeNull();
    expect(restaurantSelect?.value).toBe("10");
    expect(Array.from(restaurantSelect?.options ?? []).map((option) => option.text)).toEqual([
      "Prime Steakhouse - 5 votes (Leader)",
      "Ocean Grill - 3 votes",
    ]);
    expect(dateSelect).not.toBeNull();
    expect(dateSelect?.value).toBe("20");
    expect(Array.from(dateSelect?.options ?? [])).toHaveLength(2);
    expect(dateSelect?.options[0].text).toContain("7 votes (Leader)");
    expect(dateSelect?.options[1].text).toContain("5 votes");
  });

  it("renders the production create-poll form when no poll is active", () => {
    renderPage(
      <AdminPollsPage
          loaderData={{
            activePoll: null,
            topRestaurant: null,
            topDate: null,
            allRestaurants: [],
            allDates: [],
            closedPolls: [],
          }}
          actionData={undefined}
          matches={[] as any}
          params={{}}
      />
    );

    expect(screen.getByRole("heading", { name: "Start New Poll" })).toBeInTheDocument();
    expect(screen.getByLabelText("Poll Title")).toHaveAttribute("maxlength", "120");
    expect(screen.queryByRole("heading", { name: "Close Poll" })).not.toBeInTheDocument();
  });
});
