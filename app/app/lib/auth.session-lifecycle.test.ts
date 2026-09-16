// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteD1Harness, type SqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "./router-context";
import { commitSession, getSession } from "./session.server";
import { getUser, requireActiveUser } from "./auth.server";

describe("sessions after account replacement", () => {
  let harness: SqliteD1Harness;

  beforeEach(() => {
    harness = createSqliteD1Harness();
  });

  afterEach(() => {
    harness.sqlite.close();
  });

  async function requestForUser(userId: number) {
    const session = await getSession();
    session.set("userId", userId);
    session.set("email", "member@example.com");
    return new Request("https://meatup.club/dashboard", {
      headers: { Cookie: (await commitSession(session)).split(";")[0] },
    });
  }

  it("rejects the deleted account's signed cookie when its email is reused", async () => {
    const originalId = harness.insert("INSERT INTO users (email) VALUES ('member@example.com')");
    const request = await requestForUser(originalId);
    const context = createLoadContext({ env: { DB: harness.db } } as never);
    expect(await getUser(request, context)).toMatchObject({ id: originalId });

    harness.sqlite.prepare("DELETE FROM users WHERE id = ?").run(originalId);
    const replacementId = harness.insert("INSERT INTO users (email) VALUES ('member@example.com')");
    expect(replacementId).not.toBe(originalId);

    expect(await getUser(request, context)).toBeNull();
    await expect(requireActiveUser(request, context)).rejects.toMatchObject({ status: 302 });
    expect(await requireActiveUser(await requestForUser(replacementId), context))
      .toMatchObject({ id: replacementId });
  });
});
