// @vitest-environment node

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  decideIncidentAction,
  parseQueueListPayload,
  parseQueueMetricsPayload,
} from "../scripts/monitor-dlq.mjs";

const scriptPath = fileURLToPath(new URL("../scripts/monitor-dlq.mjs", import.meta.url));
const servers: Server[] = [];

function listen(server: Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected the test server to listen on a TCP port"));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("DLQ monitor parsing", () => {
  it("selects the exact dead-letter queue from a Cloudflare list response", () => {
    expect(
      parseQueueListPayload(
        {
          success: true,
          result: [
            { queue_id: "primary-id", queue_name: "meatup-club-email-delivery" },
            { queue_id: "dlq-id", queue_name: "meatup-club-email-delivery-dlq" },
          ],
        },
        "meatup-club-email-delivery-dlq"
      )
    ).toBe("dlq-id");
  });

  it("rejects missing queues and malformed metrics instead of treating them as empty", () => {
    expect(() =>
      parseQueueListPayload({ success: true, result: [] }, "missing-dlq")
    ).toThrow("was not found");
    expect(() =>
      parseQueueMetricsPayload({
        success: true,
        result: {
          backlog_bytes: 10,
          backlog_count: undefined,
          oldest_message_timestamp_ms: 0,
        },
      })
    ).toThrow("invalid backlog_count");
  });

  it("parses a valid realtime backlog response", () => {
    expect(
      parseQueueMetricsPayload({
        success: true,
        result: {
          backlog_bytes: 2048,
          backlog_count: 3,
          oldest_message_timestamp_ms: 1_710_950_954_154,
        },
      })
    ).toEqual({
      backlogBytes: 2048,
      backlogCount: 3,
      oldestMessageTimestampMs: 1_710_950_954_154,
    });
  });
});

describe("DLQ incident decisions", () => {
  it.each([
    { backlogCount: 2, openIncidentCount: 0, expected: "open" },
    { backlogCount: 2, openIncidentCount: 1, expected: "keep-open" },
    { backlogCount: 0, openIncidentCount: 1, expected: "resolve" },
    { backlogCount: 0, openIncidentCount: 0, expected: "none" },
  ])("returns $expected for backlog=$backlogCount and incidents=$openIncidentCount", (input) => {
    expect(decideIncidentAction(input)).toBe(input.expected);
  });

  it("does not create another incident when duplicate open incidents already exist", () => {
    expect(decideIncidentAction({ backlogCount: 1, openIncidentCount: 2 })).toBe("keep-open");
  });
});

describe("DLQ monitor command", () => {
  it("uses the realtime metrics endpoint and opens one incident", async () => {
    const requests: Array<{ method: string; path: string; body: string }> = [];
    const origin = await listen(
      createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          const path = request.url ?? "";
          requests.push({ method: request.method ?? "", path, body });
          response.setHeader("content-type", "application/json");

          if (path === "/client/v4/accounts/account-id/queues") {
            response.end(
              JSON.stringify({
                success: true,
                result: [
                  {
                    queue_id: "dlq-id",
                    queue_name: "meatup-club-email-delivery-dlq",
                  },
                ],
              })
            );
            return;
          }
          if (path === "/client/v4/accounts/account-id/queues/dlq-id/metrics") {
            response.end(
              JSON.stringify({
                success: true,
                result: {
                  backlog_bytes: 512,
                  backlog_count: 1,
                  oldest_message_timestamp_ms: 1_710_950_954_154,
                },
              })
            );
            return;
          }
          if (path === "/api/repos/owner/repo/issues?state=open&per_page=100") {
            response.end("[]");
            return;
          }
          if (path === "/api/repos/owner/repo/issues" && request.method === "POST") {
            response.end(JSON.stringify({ number: 123 }));
            return;
          }

          response.writeHead(404).end(JSON.stringify({ error: "not found" }));
        });
      })
    );

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        process.execPath,
        [scriptPath],
        {
          env: {
            ...process.env,
            CLOUDFLARE_ACCOUNT_ID: "account-id",
            CLOUDFLARE_API_BASE: `${origin}/client/v4`,
            CLOUDFLARE_API_TOKEN: "cloudflare-test-token",
            GITHUB_API_URL: `${origin}/api`,
            GITHUB_REPOSITORY: "owner/repo",
            GITHUB_RUN_ID: "456",
            GITHUB_SERVER_URL: "https://github.example",
            GITHUB_TOKEN: "github-test-token",
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            Object.assign(error, { stdout, stderr });
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        }
      );
    });

    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("backlog=1, bytes=512, openIncidents=0, action=open");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /client/v4/accounts/account-id/queues",
      "GET /client/v4/accounts/account-id/queues/dlq-id/metrics",
      "GET /api/repos/owner/repo/issues?state=open&per_page=100",
      "POST /api/repos/owner/repo/issues",
    ]);

    const createdIssue = JSON.parse(requests.at(-1)?.body ?? "{}");
    expect(createdIssue.title).toBe("[Operations] Email delivery DLQ backlog");
    expect(createdIssue.body).toContain("does not pull, acknowledge, purge, or replay messages");
    expect(createdIssue.body).not.toContain("cloudflare-test-token");
    expect(createdIssue.body).not.toContain("github-test-token");
  });

  it("comments on and closes the existing incident when the backlog clears", async () => {
    const requests: Array<{ method: string; path: string; body: string }> = [];
    const origin = await listen(
      createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          const path = request.url ?? "";
          requests.push({ method: request.method ?? "", path, body });
          response.setHeader("content-type", "application/json");

          if (path === "/client/v4/accounts/account-id/queues") {
            response.end(
              JSON.stringify({
                success: true,
                result: [
                  {
                    queue_id: "dlq-id",
                    queue_name: "meatup-club-email-delivery-dlq",
                  },
                ],
              })
            );
            return;
          }
          if (path === "/client/v4/accounts/account-id/queues/dlq-id/metrics") {
            response.end(
              JSON.stringify({
                success: true,
                result: {
                  backlog_bytes: 0,
                  backlog_count: 0,
                  oldest_message_timestamp_ms: 0,
                },
              })
            );
            return;
          }
          if (path === "/api/repos/owner/repo/issues?state=open&per_page=100") {
            response.end(
              JSON.stringify([
                { number: 22, title: "[Operations] Email delivery DLQ backlog" },
                { number: 23, title: "Unrelated issue" },
              ])
            );
            return;
          }
          if (path === "/api/repos/owner/repo/issues/22/comments" && request.method === "POST") {
            response.end(JSON.stringify({ id: 1 }));
            return;
          }
          if (path === "/api/repos/owner/repo/issues/22" && request.method === "PATCH") {
            response.end(JSON.stringify({ number: 22, state: "closed" }));
            return;
          }

          response.writeHead(404).end(JSON.stringify({ error: "not found" }));
        });
      })
    );

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        process.execPath,
        [scriptPath],
        {
          env: {
            ...process.env,
            CLOUDFLARE_ACCOUNT_ID: "account-id",
            CLOUDFLARE_API_BASE: `${origin}/client/v4`,
            CLOUDFLARE_API_TOKEN: "cloudflare-test-token",
            GITHUB_API_URL: `${origin}/api`,
            GITHUB_REPOSITORY: "owner/repo",
            GITHUB_TOKEN: "github-test-token",
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            Object.assign(error, { stdout, stderr });
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        }
      );
    });

    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("backlog=0, bytes=0, openIncidents=1, action=resolve");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /client/v4/accounts/account-id/queues",
      "GET /client/v4/accounts/account-id/queues/dlq-id/metrics",
      "GET /api/repos/owner/repo/issues?state=open&per_page=100",
      "POST /api/repos/owner/repo/issues/22/comments",
      "PATCH /api/repos/owner/repo/issues/22",
    ]);
    expect(JSON.parse(requests.at(-2)?.body ?? "{}").body).toContain(
      "backlog metric has returned to zero"
    );
    expect(JSON.parse(requests.at(-1)?.body ?? "{}")).toEqual({
      state: "closed",
      state_reason: "completed",
    });
    expect(requests.some(({ method }) => method === "DELETE")).toBe(false);
  });
});
