import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type ActionFunction } from "react-router";
import AdminEventsPage from "./dashboard.admin.events";
import { confirmAction } from "../lib/confirm.client";

vi.mock("../lib/confirm.client", () => ({ confirmAction: vi.fn() }));

function renderAdminEventsPage(displayStatus = "upcoming", action: ActionFunction = vi.fn(async () => ({ success: "Twilio accepted 1 SMS notification." })), secondEvent = false) {
  const router = createMemoryRouter([{
    path: "/",
    action,
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
        }, ...(secondEvent ? [{
          id: 43,
          restaurant_name: "Second Steakhouse",
          event_date: "2099-04-21",
          event_time: "18:00",
          created_at: "2026-09-01",
          status: displayStatus,
          displayStatus,
        }] : [])],
        topRestaurant: null,
        topDate: null,
        smsMembers: [
          { id: 1, name: "Pending Member", email: "pending@example.test" },
          { id: 2, name: "Confirmed Member", email: "yes@example.test" },
          { id: 3, name: "Maybe Member", email: "maybe@example.test" },
          { id: 4, name: "Declined Member", email: "no@example.test" },
        ],
        smsDeliveriesByEventId: {},
        smsProviderHealth: { status: "healthy", checkedAt: "2026-09-16T00:00:00Z" },
        appTimeZone: "America/New_York",
        lastSuccessfulSmsDeliveryAt: null,
        eventMembersById: { 42: [
          { id: 1, rsvp_status: null },
          { id: 2, rsvp_status: "yes" },
          { id: 3, rsvp_status: "maybe" },
          { id: 4, rsvp_status: "no" },
          { id: 5, rsvp_status: null }, // Not SMS eligible.
        ] },
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


describe("admin SMS audience and local feedback", () => {
  it("previews only matching SMS-eligible members and explains the default", () => {
    renderAdminEventsPage();
    const preview = screen.getByRole("region", { name: "SMS recipient preview" });
    expect(preview).toHaveTextContent("1 of 4 SMS-eligible members selected");
    expect(preview).toHaveTextContent("Pending Member");
    expect(preview).not.toHaveTextContent("Confirmed Member");
    expect(preview).toHaveTextContent("existing Yes, No, or Maybe");
    fireEvent.change(screen.getByLabelText("Recipients"), { target: { value: "all" } });
    expect(preview).toHaveTextContent("4 of 4 SMS-eligible members selected");
    expect(preview).toHaveTextContent("Confirmed Member");
  });

  it.each([["yes", "Confirmed Member"], ["maybe", "Maybe Member"], ["no", "Declined Member"]])(
    "previews the %s audience", (scope, name) => {
      renderAdminEventsPage();
      fireEvent.change(screen.getByLabelText("Recipients"), { target: { value: scope } });
      const preview = screen.getByRole("region", { name: "SMS recipient preview" });
      expect(preview).toHaveTextContent("1 of 4 SMS-eligible members selected");
      expect(preview).toHaveTextContent(name);
      expect(preview).not.toHaveTextContent("Pending Member");
    }
  );

  it("requires a specific eligible member before sending", () => {
    renderAdminEventsPage();
    fireEvent.change(screen.getByLabelText("Recipients"), { target: { value: "specific" } });
    expect(screen.getByRole("button", { name: "Send SMS notification" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Specific Recipient"), { target: { value: "2" } });
    expect(screen.getByRole("region", { name: "SMS recipient preview" })).toHaveTextContent("Confirmed Member");
    expect(screen.getByRole("button", { name: "Send SMS notification" })).toBeEnabled();
  });

  it("lets the admin cancel the audience confirmation without sending", () => {
    const action = vi.fn();
    const confirm = vi.mocked(confirmAction).mockReturnValue(false);
    renderAdminEventsPage("upcoming", action);
    fireEvent.click(screen.getByRole("button", { name: "Send SMS notification" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/1 member.*No RSVP yet/s));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Pending Member"));
    expect(action).not.toHaveBeenCalled();
  });

  it.each([
    [{ success: "Twilio accepted 1 SMS notification." }, "Twilio accepted 1 SMS notification."],
    [{ error: "SMS send failed. Provider unavailable." }, "SMS send failed. Provider unavailable."],
    [{ success: "No SMS-eligible members match this recipient selection." }, "No SMS-eligible members match this recipient selection."],
  ])("shows the send result next to the button: %s", async (result, message) => {
    vi.mocked(confirmAction).mockReturnValue(true);
    const action = vi.fn(async () => result);
    renderAdminEventsPage("upcoming", action);
    const form = screen.getByRole("button", { name: "Send SMS notification" }).closest("form")!;
    fireEvent.click(within(form).getByRole("button", { name: "Send SMS notification" }));
    await waitFor(() => expect(within(form).getByText(message)).toBeVisible());
    expect(action).toHaveBeenCalledOnce();
  });

  it("shows a sending state and replaces stale failure feedback on retry", async () => {
    vi.mocked(confirmAction).mockReturnValue(true);
    let finishSend: (result: { success: string }) => void = () => {};
    const action = vi.fn()
      .mockResolvedValueOnce({ error: "SMS send failed. Try again." })
      .mockImplementationOnce(() => new Promise((resolve) => { finishSend = resolve; }));
    renderAdminEventsPage("upcoming", action);
    fireEvent.click(screen.getByRole("button", { name: "Send SMS notification" }));
    await screen.findByText("SMS send failed. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Send SMS notification" }));
    expect(await screen.findByRole("button", { name: "Sending SMS…" })).toBeDisabled();
    expect(screen.queryByText("SMS send failed. Try again.")).not.toBeInTheDocument();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    finishSend({ success: "Twilio accepted 1 SMS notification." });
    await screen.findByText("Twilio accepted 1 SMS notification.");
    expect(screen.queryByText("SMS send failed. Try again.")).not.toBeInTheDocument();
  });
});


it("keeps feedback and RSVP audience local to the submitted event after revalidation", async () => {
  vi.mocked(confirmAction).mockReturnValue(true);
  const action = vi.fn(async ({ request }) => {
    const formData = await request.formData();
    expect(formData.get("event_id")).toBe("42");
    expect(formData.get("recipient_scope")).toBe("all");
    return { success: "Twilio accepted 4 SMS notifications." };
  });
  renderAdminEventsPage("upcoming", action, true);
  const firstForm = screen.getByRole("form", { name: "SMS notification for Prime Steakhouse" });
  const secondForm = screen.getByRole("form", { name: "SMS notification for Second Steakhouse" });
  expect(within(secondForm).getByRole("region")).toHaveTextContent("4 of 4");
  fireEvent.change(within(firstForm).getByLabelText("Recipients"), { target: { value: "all" } });
  fireEvent.click(within(firstForm).getByRole("button", { name: "Send SMS notification" }));
  await within(firstForm).findByText("Twilio accepted 4 SMS notifications.");
  expect(within(secondForm).queryByText("Twilio accepted 4 SMS notifications.")).not.toBeInTheDocument();
  expect(within(firstForm).getByLabelText("Recipients")).toHaveValue("all");
  expect(within(secondForm).getByLabelText("Recipients")).toHaveValue("pending");
  expect(action).toHaveBeenCalledOnce();
});
