import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./+types/dashboard.about";
import AboutPage, { loader } from "./dashboard.about";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

function createMockDb(
  content: Array<Record<string, unknown>>,
  members: Array<Record<string, unknown>>
) {
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes("site_content")) {
        return {
          all: async () => ({ results: content }),
        };
      }
      if (sql.includes("FROM users")) {
        return {
          bind: vi.fn(() => ({
            all: async () => ({ results: members }),
          })),
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}

describe("dashboard.about route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      email: "member@example.com",
      status: "active",
    } as never);
  });

  it("loads site content and active members after enforcing authentication", async () => {
    const content = [
      {
        id: 1,
        key: "description",
        title: "About",
        content: "Quarterly steakhouse dinners",
        updated_at: "2026-03-06",
      },
    ];
    const members = [
      { id: 2, email: "zane@example.com", name: "Zane Smith", picture: null, is_admin: 0 },
      { id: 3, email: "alice@example.com", name: "Alice Brown", picture: null, is_admin: 1 },
    ];

    const result = await loader({
      request: new Request("http://localhost/dashboard/about"),
      context: { cloudflare: { env: { DB: createMockDb(content, members) } } } as never,
      params: {},
    } as never);

    expect(requireActiveUser).toHaveBeenCalled();
    expect(result.content).toEqual(content);
    expect(result.members.map((m) => m.name)).toEqual(["Alice Brown", "Zane Smith"]);
  });

  it("falls back to empty content and members lists when queries return no rows", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/about"),
      context: {
        cloudflare: {
          env: {
            DB: {
              prepare: vi.fn((sql: string) => {
                if (sql.includes("FROM users")) {
                  return {
                    bind: vi.fn(() => ({
                      all: async () => ({ results: undefined }),
                    })),
                  };
                }
                return {
                  all: async () => ({ results: undefined }),
                };
              }),
            },
          },
        },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ content: [], members: [] });
  });

  it("renders members section, markdown content cards, and the info alert", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dashboard/about"]}>
        <AboutPage
          {...({
            loaderData: {
              members: [
                { id: 2, email: "alice@example.com", name: "Alice Brown", picture: null, is_admin: 1 },
                { id: 3, email: "bob@example.com", name: "Bob Carter", picture: null, is_admin: 0 },
              ],
              content: [
                {
                  id: 1,
                  key: "description",
                  title: "What We Are About",
                  content: "Quarterly **steakhouse** dinners.\n\n- Vote together\n- Show up hungry",
                  updated_at: "2026-03-06",
                },
                {
                  id: 2,
                  key: "goals",
                  title: "Goals",
                  content: "1. Plan\n2. Vote",
                  updated_at: "2026-03-06",
                },
                {
                  id: 3,
                  key: "guidelines",
                  title: "Guidelines",
                  content: "_Stay classy_",
                  updated_at: "2026-03-06",
                },
                {
                  id: 4,
                  key: "membership",
                  title: "Membership",
                  content: "# Member Expectations",
                  updated_at: "2026-03-06",
                },
                {
                  id: 5,
                  key: "safety",
                  title: "Safety",
                  content: "## Ground Rules\n### Stay sharp.",
                  updated_at: "2026-03-06",
                },
              ],
            },
          } as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Members (2)")).toBeInTheDocument();
    expect(screen.getByText("Alice Brown")).toBeInTheDocument();
    expect(screen.getByText("Bob Carter")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();

    expect(screen.getByText("Everything you need to know about our quarterly steakhouse adventures")).toBeInTheDocument();
    expect(screen.getByText("What We Are About")).toBeInTheDocument();
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Guidelines")).toBeInTheDocument();
    expect(screen.getByText("Membership")).toBeInTheDocument();
    expect(screen.getByText("Safety")).toBeInTheDocument();
    expect(screen.getByText("steakhouse")).toBeInTheDocument();
    expect(screen.getByText("Vote together")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Vote")).toBeInTheDocument();
    expect(screen.getByText("Stay classy")).toBeInTheDocument();
    expect(screen.getByText("Member Expectations")).toBeInTheDocument();
    expect(screen.getByText("Ground Rules")).toBeInTheDocument();
    expect(screen.getByText("Stay sharp.")).toBeInTheDocument();
    expect(screen.getByText("Questions or Suggestions?")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(5);
  });
});
