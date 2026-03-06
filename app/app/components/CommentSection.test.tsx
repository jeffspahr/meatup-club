import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentSection } from "./CommentSection";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => (
      <form {...props}>{children}</form>
    ),
  };
});

const comments = [
  {
    id: 101,
    user_id: 10,
    user_name: "Jeff",
    user_email: "jeff@example.com",
    user_picture: null,
    content: "First comment",
    created_at: "2026-05-01T18:00:00.000Z",
    replies: [],
  },
  {
    id: 102,
    user_id: 20,
    user_name: "Alice",
    user_email: "alice@example.com",
    user_picture: null,
    content: "Second comment",
    created_at: "2026-05-01T19:00:00.000Z",
    replies: [],
  },
];

describe("CommentSection", () => {
  it("renders an empty state when there are no comments", () => {
    render(
      <CommentSection
        comments={[]}
        currentUser={{ id: 10, isAdmin: false }}
      />
    );

    expect(screen.getByText("No comments yet")).toBeInTheDocument();
    expect(screen.getByText("Be the first to share your thoughts!")).toBeInTheDocument();
  });

  it("renders the top-level form and keeps only one reply form active at a time", () => {
    render(
      <CommentSection
        comments={comments}
        currentUser={{ id: 10, isAdmin: false }}
        title="Poll Discussion"
        placeholder="Add your thoughts..."
      />
    );

    expect(screen.getByRole("heading", { name: "Poll Discussion" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add your thoughts...")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    expect(screen.getAllByPlaceholderText("Write a reply...")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    expect(screen.getAllByPlaceholderText("Write a reply...")).toHaveLength(1);
  });
});
