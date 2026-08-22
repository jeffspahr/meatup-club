// @vitest-environment node

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("../scripts/smoke-production.mjs", import.meta.url));
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

function runSmoke(origin: string, wwwOrigin: string, attempts = 1) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      process.execPath,
      [scriptPath],
      {
        env: {
          ...process.env,
          SMOKE_ATTEMPTS: String(attempts),
          SMOKE_ORIGIN: origin,
          SMOKE_RETRY_DELAY_MS: "1",
          SMOKE_TIMEOUT_MS: "2000",
          SMOKE_WWW_ORIGIN: wwwOrigin,
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

describe("production smoke script", () => {
  it("accepts non-empty HTML responses and a www redirect to the apex", async () => {
    const apexOrigin = await listen(
      createServer((request, response) => {
        if (request.url === "/" || request.url === "/verification") {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body>available</body></html>");
          return;
        }

        response.writeHead(404).end();
      })
    );
    const wwwOrigin = await listen(
      createServer((_request, response) => {
        response.writeHead(301, { location: `${apexOrigin}/` }).end();
      })
    );

    const result = await runSmoke(apexOrigin, wwwOrigin);

    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Production smoke check passed on attempt 1/1.");
  });

  it("retries a transient failure before succeeding", async () => {
    let homeRequests = 0;
    const apexOrigin = await listen(
      createServer((request, response) => {
        if (request.url === "/") {
          homeRequests += 1;
          if (homeRequests === 1) {
            response.writeHead(503).end();
            return;
          }
        }

        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html><body>available</body></html>");
      })
    );
    const wwwOrigin = await listen(
      createServer((_request, response) => {
        response.writeHead(302, { location: `${apexOrigin}/` }).end();
      })
    );

    const result = await runSmoke(apexOrigin, wwwOrigin, 2);

    expect(result.stderr).toContain("Production smoke check attempt 1/2 failed");
    expect(result.stdout).toContain("Production smoke check passed on attempt 2/2.");
    expect(homeRequests).toBe(2);
  });

  it("fails after persistent invalid responses", async () => {
    const apexOrigin = await listen(
      createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      })
    );
    const wwwOrigin = await listen(
      createServer((_request, response) => {
        response.writeHead(301, { location: `${apexOrigin}/` }).end();
      })
    );

    await expect(runSmoke(apexOrigin, wwwOrigin, 2)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Production smoke check failed after all retry attempts."),
    });
  });
});
