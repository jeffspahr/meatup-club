import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, redirect, RouterProvider, type ActionFunction } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClosePollForm } from "./ClosePollForm";

const restaurants = [
  { id: 1, name: "First Steakhouse", vote_count: 2 },
  { id: 2, name: "Leading Steakhouse", vote_count: 4 },
  { id: 3, name: "No Votes", vote_count: 0 },
];
const dates = [
  { id: 10, suggested_date: "2099-04-01", vote_count: 1 },
  { id: 11, suggested_date: "2099-04-15", vote_count: 3 },
];

function renderForm(action: ActionFunction = () => ({ error: "Please retry" }), withVotes = true) {
  const router = createMemoryRouter([
    { path: "/", element: <ClosePollForm poll={{ id: 7, title: "Spring Poll" }} restaurants={withVotes ? restaurants : []} dates={dates} /> },
    { path: "/dashboard/admin/polls", action },
    { path: "/dashboard", element: <p>Updated dashboard</p> },
  ]);
  const result = render(<RouterProvider router={router} />);
  result.container.querySelector("details")!.open = true;
  return result;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("ClosePollForm", () => {
  it("defaults to leaders, excludes zero votes, and posts overrides to the admin action", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const submitted: FormData[] = [];
    renderForm(async ({ request }) => {
      submitted.push(await request.formData());
      return { error: "Please retry" };
    });
    expect(screen.getByLabelText("Winning restaurant")).toHaveValue("2");
    expect(screen.getByLabelText("Winning date")).toHaveValue("11");
    expect(screen.queryByRole("option", { name: /No Votes/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Winning restaurant"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Winning date"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Event time"), { target: { value: "19:30" } });
    fireEvent.submit(screen.getByRole("form", { name: "Close poll" }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(Object.fromEntries(submitted[0])).toEqual({
      _action: "close", poll_id: "7", return_to: "/dashboard",
      winning_restaurant_id: "1", winning_date_id: "10", event_time: "19:30",
      create_event: "true", send_invites: "true",
    });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("First Steakhouse"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Calendar invites will be sent"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
    expect(screen.getByLabelText("Winning restaurant")).toHaveValue("1");
    expect(screen.getByLabelText("Event time")).toHaveValue("19:30");
  });

  it("disables pending submissions, preserves fields on failure, and redirects to the dashboard on retry", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let finish: (result: { error: string }) => void = () => {};
    const action = vi.fn<ActionFunction>()
      .mockImplementationOnce(() => new Promise<{ error: string }>((resolve) => { finish = resolve; }))
      .mockImplementationOnce(() => redirect("/dashboard"));
    renderForm(action);
    fireEvent.submit(screen.getByRole("form", { name: "Close poll" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Closing poll…" })).toBeDisabled();
    expect(screen.getByLabelText("Winning restaurant")).toBeDisabled();
    await act(async () => finish({ error: "Temporary failure" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary failure");
    fireEvent.submit(screen.getByRole("form", { name: "Close poll" }));
    expect(await screen.findByText("Updated dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not submit when confirmation is cancelled", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const action = vi.fn();
    renderForm(action);
    fireEvent.submit(screen.getByRole("form", { name: "Close poll" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close poll & create event" })).toBeEnabled();
  });

  it("disables event options when closing without an event", () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("Create event from winners"));
    expect(screen.getByLabelText("Event time")).toBeDisabled();
    expect(screen.getByLabelText("Send calendar invites to all active members")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close poll without event" })).toBeInTheDocument();
  });

  it("offers closure without an event when there are no eligible winners", () => {
    renderForm(undefined, false);
    expect(screen.queryByLabelText("Create event from winners")).not.toBeInTheDocument();
    expect(screen.getByText(/both need votes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close poll without event" })).toBeInTheDocument();
  });
});
