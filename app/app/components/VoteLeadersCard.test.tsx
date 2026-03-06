import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VoteLeadersCard from "./VoteLeadersCard";

vi.mock("../lib/dateUtils", () => ({
  formatDateForDisplay: vi.fn((date: string) => `formatted:${date}`),
}));

describe("VoteLeadersCard", () => {
  it("renders nothing when there are no leaders yet", () => {
    const { container } = render(<VoteLeadersCard topRestaurant={null} topDate={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders restaurant and date leaders with variant-specific labels", () => {
    render(
      <VoteLeadersCard
        topRestaurant={{
          name: "Prime Steakhouse",
          address: "123 Main St",
          vote_count: 4,
        }}
        topDate={{
          suggested_date: "2026-06-12",
          vote_count: 5,
        }}
        variant="amber"
      />
    );

    expect(screen.getByText("Leading Restaurant")).toBeInTheDocument();
    expect(screen.getByText("Prime Steakhouse")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("Leading Date")).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-06-12")).toBeInTheDocument();
    expect(screen.getByText("4 votes")).toBeInTheDocument();
    expect(screen.getByText("5 votes")).toBeInTheDocument();
  });
});
