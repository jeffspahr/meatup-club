import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./login";
import { commitSession, getSession } from "../lib/session.server";
import { getGoogleAuthUrl } from "../lib/auth.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/session.server", () => ({
  getSession: vi.fn(),
  commitSession: vi.fn(),
}));

vi.mock("../lib/auth.server", () => ({
  getGoogleAuthUrl: vi.fn(),
}));

function createCookieRequest(url: string, cookie: string = "__session=abc") {
  return {
    url,
    headers: {
      get: vi.fn((key: string) => (key === "Cookie" ? cookie : null)),
    },
  } as unknown as Request;
}

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "123e4567-e89b-12d3-a456-426614174000"
    );
  });

  it("stores the oauth state in the session and redirects to Google", async () => {
    const session = {
      set: vi.fn(),
    };

    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(commitSession).mockResolvedValue("__session=new" as never);
    vi.mocked(getGoogleAuthUrl).mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?state=123e4567-e89b-12d3-a456-426614174000"
    );

    const response = await loader({
      request: createCookieRequest("http://localhost/login"),
      context: createLoadContext({ env: {} } as never) as never,
      params: {},
    } as never);

    expect(getSession).toHaveBeenCalledWith("__session=abc");
    expect(session.set).toHaveBeenCalledWith(
      "oauth_state",
      "123e4567-e89b-12d3-a456-426614174000"
    );
    expect(getGoogleAuthUrl).toHaveBeenCalledWith(
      "http://localhost/auth/google/callback",
      "123e4567-e89b-12d3-a456-426614174000"
    );
    expect(commitSession).toHaveBeenCalledWith(session);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=123e4567-e89b-12d3-a456-426614174000"
    );
  });
});
