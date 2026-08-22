import { pathToFileURL } from "node:url";

export const INCIDENT_TITLE = "[Operations] Worker availability or runtime errors";
const DEFAULT_ORIGIN = "https://meatup.club";
const DEFAULT_WWW_ORIGIN = "https://www.meatup.club";
const DEFAULT_SCRIPT_NAME = "meatup-club";
const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function origin(name, fallback) {
  const value = new URL(process.env[name] ?? fallback);
  if (
    !["http:", "https:"].includes(value.protocol) ||
    value.pathname !== "/" ||
    value.search ||
    value.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) origin`);
  }
  return value.origin;
}

function headers(token, github = false) {
  return github
    ? {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "meatup-club-worker-monitor/1.0",
        "x-github-api-version": "2022-11-28",
      }
    : {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "meatup-club-worker-monitor/1.0",
      };
}

async function requestJson(url, options, description) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${description} returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

export function parseWorkerErrors(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Cloudflare Analytics returned an invalid response");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error("Cloudflare Analytics query failed");
  }
  const accounts = payload.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error("Cloudflare Analytics returned an invalid account result");
  }
  const groups = accounts[0]?.workersInvocationsAdaptive;
  if (!Array.isArray(groups)) {
    throw new Error("Cloudflare Analytics returned invalid Worker metrics");
  }

  return groups.reduce((total, group) => {
    const errors = group?.sum?.errors;
    if (typeof errors !== "number" || !Number.isFinite(errors) || errors < 0) {
      throw new Error("Cloudflare Analytics returned an invalid error count");
    }
    return total + errors;
  }, 0);
}

async function workerErrorCount({ accountId, token, scriptName, lookbackMinutes, apiUrl }) {
  const query = `
    query WorkerErrors($accountTag: string!, $datetimeStart: Time!, $scriptName: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 1000
            filter: { datetime_geq: $datetimeStart, scriptName: $scriptName }
          ) {
            sum { errors }
          }
        }
      }
    }
  `;
  const datetimeStart = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();
  const payload = await requestJson(
    apiUrl,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, datetimeStart, scriptName },
      }),
    },
    "Cloudflare Analytics request"
  );
  return parseWorkerErrors(payload);
}

async function requestWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": "meatup-club-worker-monitor/1.0" },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function smokeOnce(appOrigin, wwwOrigin, timeoutMs) {
  for (const pathname of ["/", "/verification"]) {
    const url = new URL(pathname, appOrigin);
    const response = await requestWithTimeout(url, timeoutMs);
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !contentType.toLowerCase().includes("text/html")) {
      throw new Error(`${url.pathname} did not return HTML with HTTP 200`);
    }
    if ((await response.text()).trim().length === 0) {
      throw new Error(`${url.pathname} returned empty HTML`);
    }
  }

  const smsHealthUrl = new URL("/api/health/sms", appOrigin);
  const smsHealthResponse = await requestWithTimeout(smsHealthUrl, timeoutMs);
  if (smsHealthResponse.status !== 200) {
    throw new Error("SMS provider health check failed");
  }
  let smsHealth;
  try {
    smsHealth = await smsHealthResponse.json();
  } catch {
    throw new Error("SMS provider health returned invalid JSON");
  }
  if (smsHealth?.service !== "sms" || smsHealth?.status !== "healthy") {
    throw new Error("SMS provider health returned an unhealthy result");
  }

  const wwwUrl = new URL("/", wwwOrigin);
  const response = await requestWithTimeout(wwwUrl, timeoutMs);
  const location = response.headers.get("location");
  if (!REDIRECT_STATUSES.has(response.status) || !location) {
    throw new Error("www did not return the expected redirect");
  }
  if (new URL(location, wwwUrl).href !== new URL("/", appOrigin).href) {
    throw new Error("www redirected to an unexpected destination");
  }
}

export async function smokeWithRetries({ appOrigin, wwwOrigin, attempts, delayMs, timeoutMs }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await smokeOnce(appOrigin, wwwOrigin, timeoutMs);
      return { healthy: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return {
    healthy: false,
    attempts,
    errorName: lastError instanceof Error ? lastError.name : "NonErrorThrown",
  };
}

function apiUrl(base, path) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

async function openIncidents(base, repository, token) {
  const url = apiUrl(base, `repos/${repository}/issues`);
  url.searchParams.set("state", "open");
  url.searchParams.set("per_page", "100");
  const issues = await requestJson(
    url,
    { headers: headers(token, true) },
    "GitHub open-issue lookup"
  );
  if (!Array.isArray(issues)) throw new Error("GitHub returned an invalid issue list");
  return issues.filter(
    (issue) =>
      issue?.title === INCIDENT_TITLE &&
      issue.pull_request === undefined &&
      Number.isSafeInteger(issue.number)
  );
}

function runUrl(repository) {
  const runId = process.env.GITHUB_RUN_ID;
  if (!runId) return undefined;
  return `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}/actions/runs/${runId}`;
}

function incidentBody({ errors, smoke, lookbackMinutes, repository }) {
  return [
    "The independent production monitor detected a Worker problem.",
    "",
    `- Synthetic availability: ${smoke.healthy ? "healthy" : `failed ${smoke.attempts} consecutive attempts`}`,
    `- Worker runtime errors: ${errors} in the last ${lookbackMinutes} minutes`,
    runUrl(repository) ? `- Detection run: ${runUrl(repository)}` : undefined,
    "",
    "Inspect Workers Logs and the Cloudflare operations runbook. No traffic, queue message, or application data was modified by this monitor.",
  ].filter((line) => line !== undefined).join("\n");
}

async function reconcileIncident({ base, repository, token, unhealthy, body }) {
  const incidents = await openIncidents(base, repository, token);
  if (unhealthy && incidents.length === 0) {
    await requestJson(
      apiUrl(base, `repos/${repository}/issues`),
      {
        method: "POST",
        headers: headers(token, true),
        body: JSON.stringify({ title: INCIDENT_TITLE, body }),
      },
      "GitHub incident creation"
    );
    return "open";
  }
  if (unhealthy) return "keep-open";
  for (const incident of incidents) {
    await requestJson(
      apiUrl(base, `repos/${repository}/issues/${incident.number}/comments`),
      {
        method: "POST",
        headers: headers(token, true),
        body: JSON.stringify({ body: `The synthetic check is healthy and the Worker error count has returned to zero.\n\n${runUrl(repository) ? `Resolution run: ${runUrl(repository)}` : ""}` }),
      },
      "GitHub resolution comment"
    );
    await requestJson(
      apiUrl(base, `repos/${repository}/issues/${incident.number}`),
      {
        method: "PATCH",
        headers: headers(token, true),
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      },
      "GitHub incident closure"
    );
  }
  return incidents.length > 0 ? "resolve" : "none";
}

export async function main() {
  const accountId = requireEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const token = requireEnvironment("CLOUDFLARE_API_TOKEN");
  const githubToken = requireEnvironment("GITHUB_TOKEN");
  const repository = requireEnvironment("GITHUB_REPOSITORY");
  const lookbackMinutes = positiveInteger("WORKER_ERROR_LOOKBACK_MINUTES", 30);
  const errors = await workerErrorCount({
    accountId,
    token,
    scriptName: process.env.CLOUDFLARE_WORKER_NAME ?? DEFAULT_SCRIPT_NAME,
    lookbackMinutes,
    apiUrl: process.env.CLOUDFLARE_GRAPHQL_URL ?? "https://api.cloudflare.com/client/v4/graphql",
  });
  const smoke = await smokeWithRetries({
    appOrigin: origin("SMOKE_ORIGIN", DEFAULT_ORIGIN),
    wwwOrigin: origin("SMOKE_WWW_ORIGIN", DEFAULT_WWW_ORIGIN),
    attempts: positiveInteger("SMOKE_ATTEMPTS", 3),
    delayMs: positiveInteger("SMOKE_RETRY_DELAY_MS", 10_000),
    timeoutMs: positiveInteger("SMOKE_TIMEOUT_MS", 10_000),
  });
  const unhealthy = errors > 0 || !smoke.healthy;
  const action = await reconcileIncident({
    base: process.env.GITHUB_API_URL ?? "https://api.github.com",
    repository,
    token: githubToken,
    unhealthy,
    body: incidentBody({ errors, smoke, lookbackMinutes, repository }),
  });
  console.log(`Worker monitor: errors=${errors}, smoke=${smoke.healthy ? "healthy" : "failed"}, action=${action}`);
}

const isEntrypoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(`Worker monitor failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
