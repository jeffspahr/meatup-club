import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentThread } from "./CommentThread";
import { confirmAction } from "../lib/confirm.client";

vi.mock("react-router", () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
}));

vi.mock("../lib/confirm.client", () => ({
  confirmAction: vi.fn(),
}));

const comment = {
  id: 42,
  user_id: 7,
  user_name: "Taylor",
  user_email: "taylor@example.com",
  user_picture: null,
  content: "Prime sounds great.",
  created_at: "2026-01-15T18:30:00Z",
};

describe("CommentThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(confirmAction).mockReturnValue(true);
  });

  it("opens and cancels a reply with the expected form payload", () => {
    const setReplyingTo = vi.fn();
    const { rerender } = render(
      <CommentThread
        comment={comment}
        currentUser={{ id: 9, isAdmin: false }}
        replyingTo={null}
        setReplyingTo={setReplyingTo}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(setReplyingTo).toHaveBeenCalledWith(42);

    rerender(
      <CommentThread
        comment={comment}
        currentUser={{ id: 9, isAdmin: false }}
        replyingTo={42}
        setReplyingTo={setReplyingTo}
      />
    );

    const replyForm = screen.getByPlaceholderText("Write a reply...").closest("form");
    expect(replyForm).not.toBeNull();
    expect(within(replyForm!).getByDisplayValue("add_comment")).toHaveAttribute(
      "name",
      "_action"
    );
    expect(within(replyForm!).getByDisplayValue("42")).toHaveAttribute(
      "name",
      "parent_id"
    );
    expect(screen.getByPlaceholderText("Write a reply...")).toHaveAttribute(
      "maxlength",
      "1000"
    );
    expect(screen.getByPlaceholderText("Write a reply...")).toBeRequired();

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    expect(setReplyingTo).toHaveBeenLastCalledWith(null);
  });

  it("closes the reply editor when its form is submitted", () => {
    const setReplyingTo = vi.fn();
    render(
      <CommentThread
        comment={comment}
        currentUser={{ id: 9, isAdmin: false }}
        replyingTo={42}
        setReplyingTo={setReplyingTo}
      />
    );

    fireEvent.submit(screen.getByPlaceholderText("Write a reply...").closest("form")!);

    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it("shows delete controls to owners and admins with the correct payload", () => {
    const { rerender } = render(
      <CommentThread
        comment={comment}
        currentUser={{ id: 7, isAdmin: false }}
        replyingTo={null}
        setReplyingTo={vi.fn()}
      />
    );

    expect(screen.getByText("(you)")).toBeInTheDocument();
    let deleteForm = screen.getByRole("button", { name: "Delete" }).closest("form");
    expect(within(deleteForm!).getByDisplayValue("delete_comment")).toHaveAttribute(
      "name",
      "_action"
    );
    expect(within(deleteForm!).getByDisplayValue("42")).toHaveAttribute(
      "name",
      "comment_id"
    );

    rerender(
      <CommentThread
        comment={comment}
        currentUser={{ id: 9, isAdmin: true }}
        replyingTo={null}
        setReplyingTo={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    rerender(
      <CommentThread
        comment={comment}
        currentUser={{ id: 9, isAdmin: false }}
        replyingTo={null}
        setReplyingTo={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("prevents deletion when confirmation is declined", () => {
    vi.mocked(confirmAction).mockReturnValue(false);
    render(
      <CommentThread
        comment={comment}
        currentUser={{ id: 7, isAdmin: false }}
        replyingTo={null}
        setReplyingTo={vi.fn()}
      />
    );

    const clickWasNotCancelled = fireEvent.click(
      screen.getByRole("button", { name: "Delete" })
    );

    expect(clickWasNotCancelled).toBe(false);
    expect(confirmAction).toHaveBeenCalledWith(
      "Delete this comment and all replies?"
    );
  });

  it("renders nested replies and stops offering replies beyond max depth", () => {
    render(
      <CommentThread
        comment={{
          ...comment,
          replies: [{ ...comment, id: 43, content: "Nested reply", replies: [] }],
        }}
        currentUser={{ id: 9, isAdmin: false }}
        replyingTo={null}
        setReplyingTo={vi.fn()}
        depth={5}
      />
    );

    expect(screen.getByText("Nested reply")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });
});
