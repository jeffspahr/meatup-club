import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestaurantVotePicker } from "./RestaurantVotePicker";

const suggestions = [
  { id: 1, name: "Alpha", vote_count: 2, user_has_voted: 1 },
  { id: 2, name: "Bravo", vote_count: 1, user_has_voted: 0 },
];

describe("RestaurantVotePicker", () => {
  it("preserves a draft selection across refreshes until the persisted vote changes", async () => {
    const onVote = vi.fn();
    const onUnvote = vi.fn();
    const { rerender } = render(
      <RestaurantVotePicker
        suggestions={suggestions}
        onVote={onVote}
        onUnvote={onUnvote}
      />
    );

    const select = screen.getByRole("combobox", { name: "Your vote" });
    expect(select).toHaveValue("1");

    fireEvent.change(select, { target: { value: "2" } });
    expect(select).toHaveValue("2");

    rerender(
      <RestaurantVotePicker
        suggestions={suggestions.map((suggestion) => ({ ...suggestion }))}
        onVote={onVote}
        onUnvote={onUnvote}
      />
    );
    expect(select).toHaveValue("2");

    rerender(
      <RestaurantVotePicker
        suggestions={suggestions.map((suggestion) => ({
          ...suggestion,
          user_has_voted: suggestion.id === 2 ? 1 : 0,
        }))}
        onVote={onVote}
        onUnvote={onUnvote}
      />
    );

    await waitFor(() => expect(select).toHaveValue("2"));
    expect(screen.getByRole("button", { name: "Submit Vote" })).toBeDisabled();
  });
});
