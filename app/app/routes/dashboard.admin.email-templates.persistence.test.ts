// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireAdmin } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./dashboard.admin.email-templates";

vi.mock("../lib/auth.server", () => ({ requireAdmin: vi.fn() }));

describe("email template default persistence", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      DELETE FROM email_templates;
      INSERT INTO email_templates (id, name, subject, html_body, text_body, is_default)
      VALUES (1, 'Current', 'Hello', '<p>Hello</p>', 'Hello', 1),
             (2, 'Alternate', 'Hi', '<p>Hi</p>', 'Hi', 0);
    `);
    vi.mocked(requireAdmin).mockResolvedValue({ id: 1, is_admin: 1 } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { harness.sqlite.close(); vi.restoreAllMocks(); });

  function submit(intent: string, id = "2") {
    return action({
      request: new Request("https://meatup.club/dashboard/admin/email-templates", {
        method: "POST",
        body: new URLSearchParams({ _action: intent, id, name: "Next", subject: "Next", html_body: "<p>Next</p>", text_body: "Next", is_default: "true" }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it.each(["create", "update", "set_default"])("switches defaults after successful %s", async intent => {
    expect(await submit(intent)).toBeInstanceOf(Response);
    const defaults = harness.all("SELECT id FROM email_templates WHERE is_default = 1");
    expect(defaults).toEqual([{ id: intent === "create" ? 3 : 2 }]);
  });

  it.each(["create", "update", "set_default"])("preserves the default and template content when %s fails", async intent => {
    const before = harness.all("SELECT * FROM email_templates ORDER BY id");
    harness.sqlite.exec(intent === "create"
      ? "CREATE TRIGGER fail_template BEFORE INSERT ON email_templates BEGIN SELECT RAISE(ABORT, 'Insert failure'); END"
      : "CREATE TRIGGER fail_template BEFORE UPDATE ON email_templates WHEN NEW.id = 2 AND NEW.is_default = 1 BEGIN SELECT RAISE(ABORT, 'Update failure'); END");
    expect(await submit(intent)).toEqual({ error: intent === "set_default" ? "Failed to set default template" : "Failed to save template" });
    expect(harness.all("SELECT * FROM email_templates ORDER BY id")).toEqual(before);
  });

  it.each(["update", "set_default"])("preserves the default for a nonexistent %s target", async intent => {
    expect(await submit(intent, "999")).toEqual({ error: "Template not found" });
    expect(harness.all("SELECT id FROM email_templates WHERE is_default = 1")).toEqual([{ id: 1 }]);
  });
});
