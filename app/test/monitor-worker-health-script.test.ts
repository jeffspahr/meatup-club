// @vitest-environment node

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseWorkerErrors } from "../scripts/monitor-worker-health.mjs";

const scriptPath = fileURLToPath(
  new URL("../scripts/monitor-worker-health.mjs", import.meta.url)
);
const servers: Server[] = [];

function listen(server: Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected a TCP listener"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function runMonitor(env: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [scriptPath],
      { env: { ...process.env, ...env } },
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
}

async function healthyOrigins() {
  const app = await listen(
    createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" }).end("<p>ok</p>");
    })
  );
  const www = await listen(
    createServer((_request, response) => {
      response.writeHead(301, { location: `${app}/` }).end();
    })
  );
  return { app, www };
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

describe("Worker metrics parsing", () => {
  it("sums errors across Worker metric groups", () => {
    expect(
      parseWorkerErrors({
        data: {
          viewer: {
            accounts: [
              { workersInvocationsAdaptive: [{ sum: { errors: 2 } }, { sum: { errors: 3 } }] },
            ],
          },
        },
      })
    ).toBe(5);
  });

  it("rejects API and malformed metric responses instead of reporting recovery", () => {
    expect(() => parseWorkerErrors({ errors: [{ message: "forbidden" }] })).toThrow(
      "query failed"
    );
    expect(() =>
      parseWorkerErrors({
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: {} }] }] } },
      })
    ).toThrow("invalid error count");
  });
});

describe("Worker health monitor command", () => {
  it("opens one incident when Cloudflare reports a runtime error", async () => {
    const requests: Array<{ method: string; path: string; body: string }> = [];
    const { app, www } = await healthyOrigins();
    const api = await listen(
      createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => {
          const path = request.url ?? "";
          requests.push({ method: request.method ?? "", path, body });
          response.setHeader("content-type", "application/json");
          if (path === "/graphql") {
            response.end(
              JSON.stringify({
                data: {
                  viewer: {
                    accounts: [{ workersInvocationsAdaptive: [{ sum: { errors: 1 } }] }],
                  },
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
            response.end('{"number":42}');
            return;
          }
          response.writeHead(404).end('{"error":"not found"}');
        });
      })
    );

    const result = await runMonitor({
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_API_TOKEN: "cloudflare-test-token",
      CLOUDFLARE_GRAPHQL_URL: `${api}/graphql`,
      GITHUB_API_URL: `${api}/api`,
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_TOKEN: "github-test-token",
      SMOKE_ATTEMPTS: "1",
      SMOKE_ORIGIN: app,
      SMOKE_RETRY_DELAY_MS: "1",
      SMOKE_TIMEOUT_MS: "1000",
      SMOKE_WWW_ORIGIN: www,
    });

    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("errors=1, smoke=healthy, action=open");
    const issueRequest = requests.find(
      ({ method, path }) => method === "POST" && path === "/api/repos/owner/repo/issues"
    );
    expect(issueRequest).toBeDefined();
    expect(issueRequest?.body).not.toContain("cloudflare-test-token");
    expect(issueRequest?.body).not.toContain("github-test-token");
    const graphqlBody = JSON.parse(requests[0]?.body ?? "{}");
    expect(graphqlBody.variables).toEqual(
      expect.objectContaining({ accountTag: "account-id", scriptName: "meatup-club" })
    );
  });

  it("comments on and closes the existing incident after recovery", async () => {
    const requests: string[] = [];
    const { app, www } = await healthyOrigins();
    const api = await listen(
      createServer((request, response) => {
        const path = request.url ?? "";
        requests.push(`${request.method} ${path}`);
        response.setHeader("content-type", "application/json");
        if (path === "/graphql") {
          response.end(
            JSON.stringify({
              data: {
                viewer: {
                  accounts: [{ workersInvocationsAdaptive: [{ sum: { errors: 0 } }] }],
                },
              },
            })
          );
          return;
        }
        if (path === "/api/repos/owner/repo/issues?state=open&per_page=100") {
          response.end(
            JSON.stringify([
              { number: 42, title: "[Operations] Worker availability or runtime errors" },
            ])
          );
          return;
        }
        if (path === "/api/repos/owner/repo/issues/42/comments") {
          response.end('{"id":1}');
          return;
        }
        if (path === "/api/repos/owner/repo/issues/42") {
          response.end('{"number":42,"state":"closed"}');
          return;
        }
        response.writeHead(404).end('{"error":"not found"}');
      })
    );

    const result = await runMonitor({
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_API_TOKEN: "cloudflare-test-token",
      CLOUDFLARE_GRAPHQL_URL: `${api}/graphql`,
      GITHUB_API_URL: `${api}/api`,
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_TOKEN: "github-test-token",
      SMOKE_ATTEMPTS: "1",
      SMOKE_ORIGIN: app,
      SMOKE_RETRY_DELAY_MS: "1",
      SMOKE_TIMEOUT_MS: "1000",
      SMOKE_WWW_ORIGIN: www,
    });

    expect(result.stdout).toContain("errors=0, smoke=healthy, action=resolve");
    expect(requests).toContain("POST /api/repos/owner/repo/issues/42/comments");
    expect(requests).toContain("PATCH /api/repos/owner/repo/issues/42");
  });
});
