import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentSection } from "./CommentSection";

vi.mock("react-router", () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
}));

vi.mock("../lib/confirm.client", () => ({
  confirmAction: vi.fn(() => true),
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

describe("CommentSection", () => {
  it("renders custom copy, an add-comment payload, and an empty state", () => {
    render(
      <CommentSection
        comments={[]}
        currentUser={{ id: 7, isAdmin: false }}
        title="Event discussion"
        placeholder="Add event notes..."
      />
    );

    expect(screen.getByRole("heading", { name: "Event discussion" })).toBeInTheDocument();
    const commentForm = screen.getByPlaceholderText("Add event notes...").closest("form");
    expect(commentForm).not.toBeNull();
    expect(within(commentForm!).getByDisplayValue("add_comment")).toHaveAttribute(
      "name",
      "_action"
    );
    expect(screen.getByPlaceholderText("Add event notes...")).toBeRequired();
    expect(screen.getByPlaceholderText("Add event notes...")).toHaveAttribute(
      "maxlength",
      "1000"
    );
    expect(screen.getByText("No comments yet")).toBeInTheDocument();
  });

  it("renders real threads and manages which reply editor is open", () => {
    render(
      <CommentSection
        comments={[comment, { ...comment, id: 43, content: "Second comment" }]}
        currentUser={{ id: 9, isAdmin: false }}
      />
    );

    const replyButtons = screen.getAllByRole("button", { name: "Reply" });
    fireEvent.click(replyButtons[0]);
    expect(screen.getByPlaceholderText("Write a reply...")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(2);

    const remainingReplyButtons = screen.getAllByRole("button", { name: "Reply" });
    fireEvent.click(remainingReplyButtons[remainingReplyButtons.length - 1]);

    expect(screen.getByPlaceholderText("Write a reply...")).toBeInTheDocument();
    const parentId = screen
      .getByPlaceholderText("Write a reply...")
      .closest("form")
      ?.querySelector<HTMLInputElement>('input[name="parent_id"]');
    expect(parentId).toHaveValue("43");
  });
});
