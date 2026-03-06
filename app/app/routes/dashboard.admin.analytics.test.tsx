import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAnalyticsPage, { loader } from "./dashboard.admin.analytics";
import { requireActiveUser } from "../lib/auth.server";
import { getActivityStats, getAllActivity } from "../lib/activity.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  getAllActivity: vi.fn(),
  getActivityStats: vi.fn(),
}));

describe("dashboard.admin.analytics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
    vi.mocked(getAllActivity).mockResolvedValue([]);
    vi.mocked(getActivityStats).mockResolvedValue({
      total: 0,
      recentLogins: 0,
      byType: [],
      mostActiveUsers: [],
    } as never);
  });

  it("rejects non-admin users in the loader", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 2,
      is_admin: 0,
      status: "active",
    } as never);

    await expect(
      loader({
        request: new Request("http://localhost/dashboard/admin/analytics"),
        context: { cloudflare: { env: { DB: {} } } } as never,
        params: {},
      } as never)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("loads paginated activity and stats for admins", async () => {
    vi.mocked(getAllActivity).mockResolvedValue([
      { id: 1, action_type: "login" },
    ] as never);
    vi.mocked(getActivityStats).mockResolvedValue({
      total: 1,
      recentLogins: 1,
      byType: [{ action_type: "login", count: 1 }],
      mostActiveUsers: [],
    } as never);

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/analytics?page=2"),
      context: { cloudflare: { env: { DB: { marker: true } } } } as never,
      params: {},
    } as never);

    expect(getAllActivity).toHaveBeenCalledWith({ marker: true }, 50, 50);
    expect(getActivityStats).toHaveBeenCalledWith({ marker: true });
    expect(result).toEqual({
      activities: [{ id: 1, action_type: "login" }],
      stats: {
        total: 1,
        recentLogins: 1,
        byType: [{ action_type: "login", count: 1 }],
        mostActiveUsers: [],
      },
      page: 2,
    });
  });

  it("filters activities by action type in the component", () => {
    const props = {
      loaderData: {
        page: 1,
        activities: [
          {
            id: 1,
            action_type: "login",
            action_details: null,
            created_at: "2026-05-01T18:00:00.000Z",
            user_name: "Admin",
            user_email: "admin@example.com",
            ip_address: "203.0.113.10",
          },
          {
            id: 2,
            action_type: "vote_cast",
            action_details: JSON.stringify({ restaurantId: 10 }),
            created_at: "2026-05-02T18:00:00.000Z",
            user_name: null,
            user_email: "member@example.com",
            ip_address: null,
          },
        ],
        stats: {
          total: 2,
          recentLogins: 1,
          byType: [
            { action_type: "login", count: 1 },
            { action_type: "vote_cast", count: 1 },
          ],
          mostActiveUsers: [
            { id: 1, name: "Admin", email: "admin@example.com", activity_count: 2 },
          ],
        },
      },
    } as any;

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/analytics"]}>
        <AdminAnalyticsPage {...props} />
      </MemoryRouter>
    );

    expect(screen.getAllByText("member@example.com")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Vote Cast/i }));

    const activityTable = screen.getByRole("table");

    expect(within(activityTable).queryAllByText("admin@example.com")).toHaveLength(0);
    expect(within(activityTable).getAllByText("member@example.com")).toHaveLength(2);
    expect(screen.getByText(/restaurantId/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(within(activityTable).getAllByText("admin@example.com")).toHaveLength(1);
  });
});
