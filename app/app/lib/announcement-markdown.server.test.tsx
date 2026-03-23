import { render, screen } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import {
  announcementPreviewMarkdownComponents,
  renderAnnouncementMessageHtml,
} from "./announcement-markdown.server";

const richMarkdown = `# Club Update

## Agenda

### Checklist

Paragraph with **bold**, *italics*, and [docs](https://example.com/docs).

- First item
- Second item

1. Number one
2. Number two

> Important quoted detail

Inline \`snippet\`

\`\`\`
const invite = "ready";
\`\`\`
`;

describe("announcement-markdown.server", () => {
  it("renders the preview markdown components for supported markdown elements", () => {
    render(
      <ReactMarkdown components={announcementPreviewMarkdownComponents}>
        {richMarkdown}
      </ReactMarkdown>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Club Update" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Checklist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com/docs"
    );
    expect(screen.getByText("Important quoted detail").closest("blockquote")).not.toBeNull();
    expect(screen.getByText("snippet").tagName).toBe("CODE");
    expect(screen.getByText('const invite = "ready";').closest("pre")).not.toBeNull();
  });

  it("renders the email html shell and converts markdown into email-safe markup", () => {
    const html = renderAnnouncementMessageHtml(richMarkdown);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("MeatUp.Club");
    expect(html).toContain("Club Update");
    expect(html).toContain(">Agenda<");
    expect(html).toContain("https://example.com/docs");
    expect(html).toContain("Important quoted detail");
    expect(html).toContain("const invite = &quot;ready&quot;;");
  });
});
