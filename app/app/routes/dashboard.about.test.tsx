import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./+types/dashboard.about";
import AboutPage, { loader } from "./dashboard.about";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

function createMockDb(content: Array<Record<string, unknown>>) {
  return {
    prepare: vi.fn((sql: string) => ({
      all: async () => {
        expect(sql).toContain("SELECT * FROM site_content ORDER BY id ASC");
        return { results: content };
      },
    })),
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

  it("loads site content after enforcing authentication", async () => {
    const content = [
      {
        id: 1,
        key: "description",
        title: "About",
        content: "Quarterly steakhouse dinners",
        updated_at: "2026-03-06",
      },
    ];

    const result = await loader({
      request: new Request("http://localhost/dashboard/about"),
      context: { cloudflare: { env: { DB: createMockDb(content) } } } as never,
      params: {},
    } as never);

    expect(requireActiveUser).toHaveBeenCalled();
    expect(result).toEqual({ content });
  });

  it("falls back to an empty content list when the content query returns no rows", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/about"),
      context: {
        cloudflare: {
          env: {
            DB: {
              prepare: vi.fn(() => ({
                all: async () => ({ results: undefined }),
              })),
            },
          },
        },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ content: [] });
  });

  it("renders markdown-backed content cards and the info alert", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dashboard/about"]}>
        <AboutPage
          {...({
            loaderData: {
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
