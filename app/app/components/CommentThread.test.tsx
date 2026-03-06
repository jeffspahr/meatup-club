import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CommentThread } from "./CommentThread";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => (
      <form {...props}>{children}</form>
    ),
  };
});

const baseComment = {
  id: 101,
  user_id: 10,
  user_name: "Jeff",
  user_email: "jeff@example.com",
  user_picture: null,
  content: "Top-level comment",
  created_at: "2026-05-01T18:00:00.000Z",
  replies: [
    {
      id: 202,
      user_id: 20,
      user_name: "Alice",
      user_email: "alice@example.com",
      user_picture: null,
      content: "Nested reply",
      created_at: "2026-05-01T19:00:00.000Z",
    },
  ],
};

function CommentThreadHarness({
  currentUser,
}: {
  currentUser: { id: number; isAdmin: boolean };
}) {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  return (
    <CommentThread
      comment={baseComment}
      currentUser={currentUser}
      replyingTo={replyingTo}
      setReplyingTo={setReplyingTo}
    />
  );
}

describe("CommentThread", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nested replies and toggles the reply form", () => {
    render(<CommentThreadHarness currentUser={{ id: 99, isAdmin: false }} />);

    expect(screen.getByText("Top-level comment")).toBeInTheDocument();
    expect(screen.getByText("Nested reply")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]);

    expect(screen.getByPlaceholderText("Write a reply...")).toBeInTheDocument();
    expect(document.querySelector('input[name="parent_id"]')).toHaveValue("101");

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[1]);

    expect(screen.queryByPlaceholderText("Write a reply...")).not.toBeInTheDocument();
  });

  it("only shows delete controls to the author or an admin", () => {
    const { rerender } = render(
      <CommentThreadHarness currentUser={{ id: 10, isAdmin: false }} />
    );

    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);

    rerender(<CommentThreadHarness currentUser={{ id: 99, isAdmin: true }} />);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);

    rerender(<CommentThreadHarness currentUser={{ id: 99, isAdmin: false }} />);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("prevents deletion when the confirmation dialog is declined", () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    render(<CommentThreadHarness currentUser={{ id: 10, isAdmin: false }} />);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });

    act(() => {
      deleteButton.dispatchEvent(clickEvent);
    });

    expect(confirmSpy).toHaveBeenCalledWith("Delete this comment and all replies?");
    expect(clickEvent.defaultPrevented).toBe(true);
  });
});
