import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestaurantVotePicker } from "./RestaurantVotePicker";

const suggestions = [
  { id: 1, name: "Alpha", vote_count: 2, user_has_voted: 1 },
  { id: 2, name: "Bravo", vote_count: 1, user_has_voted: 0 },
];

describe("RestaurantVotePicker", () => {
  it("preserves a draft selection across refreshes until the persisted vote changes", () => {
    const { rerender } = render(
      <RestaurantVotePicker key="1" suggestions={suggestions} />
    );

    const select = screen.getByRole("combobox", { name: "Your vote" });
    expect(select).toHaveValue("1");

    fireEvent.change(select, { target: { value: "2" } });
    expect(select).toHaveValue("2");

    rerender(
      <RestaurantVotePicker
        key="1"
        suggestions={suggestions.map((suggestion) => ({ ...suggestion }))}
      />
    );
    expect(select).toHaveValue("2");

    rerender(
      <RestaurantVotePicker
        key="2"
        suggestions={suggestions.map((suggestion) => ({
          ...suggestion,
          user_has_voted: suggestion.id === 2 ? 1 : 0,
        }))}
      />
    );

    expect(screen.getByRole("combobox", { name: "Your vote" })).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Save Vote" })).toBeEnabled();
  });

  it("submits the selected restaurant through native form fields", () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      expect(formData.get("_action")).toBe("vote_restaurant");
      expect(formData.get("suggestion_id")).toBe("2");
    });

    render(
      <form onSubmit={onSubmit}>
        <input type="hidden" name="_action" value="vote_restaurant" />
        <RestaurantVotePicker suggestions={suggestions} />
      </form>
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Your vote" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Vote" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("keeps the native submit available until an enhanced request is pending", () => {
    const { rerender } = render(<RestaurantVotePicker suggestions={suggestions} />);

    expect(screen.getByRole("button", { name: "Save Vote" })).toBeEnabled();

    rerender(<RestaurantVotePicker suggestions={suggestions} isSubmitting />);
    expect(screen.getByRole("button", { name: "Saving Vote…" })).toBeDisabled();
  });
});
