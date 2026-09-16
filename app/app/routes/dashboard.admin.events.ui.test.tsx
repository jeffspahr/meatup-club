import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import AdminEventsPage from "./dashboard.admin.events";

function renderAdminEventsPage(displayStatus = "upcoming") {
  const router = createMemoryRouter([{
    path: "/",
    element: <AdminEventsPage
      loaderData={{
        events: [{
          id: 42,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2099-04-20",
          event_time: "18:00",
          created_at: "2026-09-01",
          status: displayStatus,
          displayStatus,
        }],
        topRestaurant: null,
        topDate: null,
        smsMembers: [],
        smsDeliveriesByEventId: {},
        smsProviderHealth: { status: "healthy", checkedAt: "2026-09-16T00:00:00Z" },
        appTimeZone: "America/New_York",
        lastSuccessfulSmsDeliveryAt: null,
        eventMembersById: {},
      } as never}
      actionData={undefined as never}
      matches={[] as never}
      params={{} as never}
    />,
  }]);
  return render(<RouterProvider router={router} />);
}

describe("admin event SMS controls", () => {
  it("defaults to no RSVP yet and allows switching to all opted-in members", () => {
    renderAdminEventsPage();
    const recipients = screen.getByRole("combobox", { name: "Recipients" });
    expect(recipients).toHaveValue("pending");
    expect(screen.getByRole("option", { name: "No RSVP yet" })).toBeInTheDocument();
    fireEvent.change(recipients, { target: { value: "all" } });
    expect(recipients).toHaveValue("all");
    expect(screen.getByRole("button", { name: "Send SMS notification" })).toBeInTheDocument();
  });

  it.each(["completed", "cancelled"])("hides SMS controls for %s events", (status) => {
    renderAdminEventsPage(status);
    expect(screen.queryByRole("button", { name: "Send SMS notification" })).not.toBeInTheDocument();
  });
});
