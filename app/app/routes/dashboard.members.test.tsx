import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./+types/dashboard.members";
import MembersPage, { loader } from "./dashboard.members";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/dateUtils", () => ({
  formatDateForDisplay: vi.fn((date: string) => `formatted:${date}`),
}));

function createMockDb(members: Array<Record<string, unknown>>) {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        all: async () => {
          expect(sql).toContain("SELECT * FROM users WHERE status = ? ORDER BY created_at ASC");
          expect(bindArgs).toEqual(["active"]);
          return { results: members };
        },
      }),
    })),
  };
}

describe("dashboard.members route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      email: "member@example.com",
      status: "active",
    } as never);
  });

  it("loads active members after enforcing authentication", async () => {
    const members = [
      {
        id: 1,
        email: "member@example.com",
        name: "Jeff",
        picture: null,
        is_admin: 1,
        status: "active",
        created_at: "2026-03-01",
      },
    ];

    const result = await loader({
      request: new Request("http://localhost/dashboard/members"),
      context: { cloudflare: { env: { DB: createMockDb(members) } } } as never,
      params: {},
    } as never);

    expect(requireActiveUser).toHaveBeenCalled();
    expect(result).toEqual({ members });
  });

  it("renders the member grid with admin badges and fallback names", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/members"]}>
        <MembersPage
          {...({
            loaderData: {
              members: [
                {
                  id: 1,
                  email: "admin@example.com",
                  name: "Jeff",
                  picture: null,
                  is_admin: 1,
                  status: "active",
                  created_at: "2026-03-01",
                },
                {
                  id: 2,
                  email: "member@example.com",
                  name: null,
                  picture: null,
                  is_admin: 0,
                  status: "active",
                  created_at: "2026-03-02",
                },
              ],
            },
          } as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Active Meatup.Club members (2)")).toBeInTheDocument();
    expect(screen.getByText("Jeff")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("No name")).toBeInTheDocument();
    expect(screen.getByText("Joined formatted:2026-03-01")).toBeInTheDocument();
    expect(screen.getByText("Joined formatted:2026-03-02")).toBeInTheDocument();
  });
});
