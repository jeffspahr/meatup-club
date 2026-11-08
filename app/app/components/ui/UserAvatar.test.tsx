import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "./UserAvatar";

describe("UserAvatar", () => {
  beforeEach(() => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows initials until the document finishes loading, then requests the photo", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
    render(<UserAvatar src="https://images.example.com/avatar.jpg" name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent(window, new Event("load"));
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveAttribute("src", "https://images.example.com/avatar.jpg");
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });

  it("renders the image avatar and falls back to the email for alt text", () => {
    const { rerender } = render(
      <UserAvatar src="https://images.example.com/avatar.jpg" name="Ada Lovelace" size="lg" className="ring-2" />
    );

    let image = screen.getByRole("img", { name: "Ada Lovelace" });
    expect(image).toHaveAttribute("src", "https://images.example.com/avatar.jpg");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("width", "48");
    expect(image).toHaveAttribute("height", "48");
    expect(image.className).toContain("w-12");
    expect(image.className).toContain("ring-2");

    rerender(
      <UserAvatar
        src="https://images.example.com/avatar.jpg"
        name={null}
        email="member@example.com"
      />
    );

    image = screen.getByRole("img", { name: "member@example.com" });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("width", "32");
    expect(image).toHaveAttribute("height", "32");
  });

  it("renders initials from the member name when no image is available", () => {
    render(<UserAvatar src={null} name="Ada Lovelace" />);

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to the email initial and then a question mark", () => {
    const { rerender } = render(
      <UserAvatar src={null} name={null} email="member@example.com" />
    );

    expect(screen.getByText("M")).toBeInTheDocument();

    rerender(<UserAvatar src={null} name={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
