import ReactMarkdown, { type Components } from "react-markdown";
import { renderToStaticMarkup } from "react-dom/server";

export const announcementPreviewMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mb-3 text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 text-foreground">{children}</h3>,
  p: ({ children }) => <p className="mb-4 leading-7 text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 ml-6 list-disc space-y-2 text-foreground">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-4 ml-6 list-decimal space-y-2 text-foreground">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 border-l-4 border-accent pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-accent underline decoration-accent/40 underline-offset-4"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded-sm bg-accent/10 px-1.5 py-0.5 font-mono text-[0.95em] text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-md bg-muted px-4 py-3 text-sm text-foreground">
      {children}
    </pre>
  ),
};

const announcementEmailMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h1
      style={{
        margin: "0 0 16px",
        fontSize: "30px",
        lineHeight: "1.2",
        fontWeight: "700",
        color: "#111827",
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{
        margin: "24px 0 14px",
        fontSize: "24px",
        lineHeight: "1.3",
        fontWeight: "700",
        color: "#111827",
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{
        margin: "20px 0 12px",
        fontSize: "18px",
        lineHeight: "1.4",
        fontWeight: "600",
        color: "#111827",
      }}
    >
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p
      style={{
        margin: "0 0 16px",
        fontSize: "16px",
        lineHeight: "1.7",
        color: "#374151",
      }}
    >
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul
      style={{
        margin: "0 0 16px",
        paddingLeft: "24px",
        color: "#374151",
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        margin: "0 0 16px",
        paddingLeft: "24px",
        color: "#374151",
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      style={{
        marginBottom: "8px",
        lineHeight: "1.6",
      }}
    >
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "0 0 16px",
        padding: "4px 0 4px 16px",
        borderLeft: "4px solid #991b1b",
        color: "#6b7280",
        fontStyle: "italic",
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      style={{
        color: "#991b1b",
        textDecoration: "underline",
      }}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong
      style={{
        fontWeight: "700",
        color: "#111827",
      }}
    >
      {children}
    </strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
  code: ({ children }) => (
    <code
      style={{
        padding: "2px 6px",
        borderRadius: "6px",
        backgroundColor: "#f3f4f6",
        fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "0.95em",
        color: "#111827",
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre
      style={{
        margin: "0 0 16px",
        padding: "14px 16px",
        borderRadius: "8px",
        overflowX: "auto",
        backgroundColor: "#f3f4f6",
        color: "#111827",
        fontSize: "14px",
        lineHeight: "1.5",
      }}
    >
      {children}
    </pre>
  ),
};

export function renderAnnouncementMessageHtml(messageMarkdown: string): string {
  const renderedMarkdown = renderToStaticMarkup(
    <ReactMarkdown components={announcementEmailMarkdownComponents}>
      {messageMarkdown}
    </ReactMarkdown>
  );

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center">
            <table role="presentation" style="width: 680px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);">
              <tr>
                <td style="padding: 28px 32px; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); color: #ffffff;">
                  <div style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9;">MeatUp.Club</div>
                  <div style="margin-top: 8px; font-size: 28px; font-weight: 700;">Club Update</div>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  ${renderedMarkdown}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
