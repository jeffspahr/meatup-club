import { pathToFileURL } from "node:url";

export const DEFAULT_DLQ_NAME = "meatup-club-email-delivery-dlq";
export const INCIDENT_TITLE = "[Operations] Email delivery DLQ backlog";

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Cloudflare returned an invalid ${description} response`);
  }

  return value;
}

function assertNonNegativeNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Cloudflare returned an invalid ${fieldName}`);
  }

  return value;
}

export function parseQueueListPayload(payload, queueName) {
  const response = assertObject(payload, "queue list");
  if (response.success !== true || !Array.isArray(response.result)) {
    throw new Error("Cloudflare queue lookup failed");
  }

  const matches = response.result.filter(
    (queue) =>
      queue &&
      typeof queue === "object" &&
      queue.queue_name === queueName &&
      typeof queue.queue_id === "string" &&
      queue.queue_id.length > 0
  );

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Cloudflare queue ${queueName} was not found`
        : `Cloudflare returned multiple queues named ${queueName}`
    );
  }

  return matches[0].queue_id;
}

export function parseQueueMetricsPayload(payload) {
  const response = assertObject(payload, "queue metrics");
  if (response.success !== true) {
    throw new Error("Cloudflare queue metrics request failed");
  }

  const result = assertObject(response.result, "queue metrics result");
  return {
    backlogBytes: assertNonNegativeNumber(result.backlog_bytes, "backlog_bytes"),
    backlogCount: assertNonNegativeNumber(result.backlog_count, "backlog_count"),
    oldestMessageTimestampMs: assertNonNegativeNumber(
      result.oldest_message_timestamp_ms,
      "oldest_message_timestamp_ms"
    ),
  };
}

export function decideIncidentAction({ backlogCount, openIncidentCount }) {
  assertNonNegativeNumber(backlogCount, "backlog count");
  if (!Number.isSafeInteger(openIncidentCount) || openIncidentCount < 0) {
    throw new Error("open incident count must be a non-negative integer");
  }

  if (backlogCount > 0) {
    return openIncidentCount === 0 ? "open" : "keep-open";
  }

  return openIncidentCount === 0 ? "none" : "resolve";
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function requestJson(url, options, description) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${description} returned HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function apiUrl(base, path) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "meatup-club-dlq-monitor/1.0",
    "x-github-api-version": "2022-11-28",
  };
}

function cloudflareHeaders(token) {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "user-agent": "meatup-club-dlq-monitor/1.0",
  };
}

function formatOldestMessage(timestampMs) {
  return timestampMs === 0 ? "unknown" : new Date(timestampMs).toISOString();
}

function runUrl(repository) {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runId = process.env.GITHUB_RUN_ID;
  return runId ? `${server}/${repository}/actions/runs/${runId}` : undefined;
}

function incidentBody(metrics, queueName, repository) {
  const workflowRun = runUrl(repository);
  return [
    `The Cloudflare dead-letter queue \`${queueName}\` has a non-zero backlog.`,
    "",
    `- Backlog: ${metrics.backlogCount} message(s) / ${metrics.backlogBytes} byte(s)`,
    `- Oldest message: ${formatOldestMessage(metrics.oldestMessageTimestampMs)}`,
    workflowRun ? `- Detection run: ${workflowRun}` : undefined,
    "",
    "Inspect the failed deliveries and the Cloudflare operations runbook before replaying anything.",
    "The monitor only reads queue metrics; it does not pull, acknowledge, purge, or replay messages.",
    "Application-level terminal delivery failures are acknowledged and recorded in D1, so they do not necessarily enter this DLQ.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function resolutionBody(repository) {
  const workflowRun = runUrl(repository);
  return [
    "The Cloudflare DLQ backlog metric has returned to zero. Closing this incident.",
    workflowRun ? `Resolution run: ${workflowRun}` : undefined,
    "",
    "This only confirms the current backlog is empty; it does not prove that every failed delivery was replayed successfully.",
    "Application-level failures recorded in D1 require separate review.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

async function listOpenIncidents(apiBase, repository, token) {
  const url = apiUrl(apiBase, `repos/${repository}/issues`);
  url.searchParams.set("state", "open");
  url.searchParams.set("per_page", "100");

  const issues = await requestJson(
    url,
    { headers: githubHeaders(token) },
    "GitHub open-issue lookup"
  );
  if (!Array.isArray(issues)) {
    throw new Error("GitHub open-issue lookup returned an invalid response");
  }

  return issues.filter(
    (issue) =>
      issue &&
      typeof issue === "object" &&
      issue.title === INCIDENT_TITLE &&
      issue.pull_request === undefined &&
      Number.isSafeInteger(issue.number)
  );
}

async function openIncident(apiBase, repository, token, body) {
  await requestJson(
    apiUrl(apiBase, `repos/${repository}/issues`),
    {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({ title: INCIDENT_TITLE, body }),
    },
    "GitHub incident creation"
  );
}

async function resolveIncidents(apiBase, repository, token, incidents, body) {
  for (const incident of incidents) {
    await requestJson(
      apiUrl(apiBase, `repos/${repository}/issues/${incident.number}/comments`),
      {
        method: "POST",
        headers: githubHeaders(token),
        body: JSON.stringify({ body }),
      },
      "GitHub resolution comment"
    );
    await requestJson(
      apiUrl(apiBase, `repos/${repository}/issues/${incident.number}`),
      {
        method: "PATCH",
        headers: githubHeaders(token),
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      },
      "GitHub incident closure"
    );
  }
}

export async function main() {
  const accountId = requireEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const cloudflareToken = requireEnvironment("CLOUDFLARE_API_TOKEN");
  const githubToken = requireEnvironment("GITHUB_TOKEN");
  const repository = requireEnvironment("GITHUB_REPOSITORY");
  const queueName = process.env.CLOUDFLARE_DLQ_NAME ?? DEFAULT_DLQ_NAME;
  const cloudflareApi = process.env.CLOUDFLARE_API_BASE ?? "https://api.cloudflare.com/client/v4";
  const githubApi = process.env.GITHUB_API_URL ?? "https://api.github.com";

  const queueList = await requestJson(
    apiUrl(cloudflareApi, `accounts/${accountId}/queues`),
    { headers: cloudflareHeaders(cloudflareToken) },
    "Cloudflare queue lookup"
  );
  const queueId = parseQueueListPayload(queueList, queueName);
  const metricsPayload = await requestJson(
    apiUrl(cloudflareApi, `accounts/${accountId}/queues/${queueId}/metrics`),
    { headers: cloudflareHeaders(cloudflareToken) },
    "Cloudflare queue metrics request"
  );
  const metrics = parseQueueMetricsPayload(metricsPayload);
  const incidents = await listOpenIncidents(githubApi, repository, githubToken);
  const action = decideIncidentAction({
    backlogCount: metrics.backlogCount,
    openIncidentCount: incidents.length,
  });

  if (action === "open") {
    await openIncident(githubApi, repository, githubToken, incidentBody(metrics, queueName, repository));
  } else if (action === "resolve") {
    await resolveIncidents(
      githubApi,
      repository,
      githubToken,
      incidents,
      resolutionBody(repository)
    );
  }

  console.log(
    `DLQ monitor: backlog=${metrics.backlogCount}, bytes=${metrics.backlogBytes}, openIncidents=${incidents.length}, action=${action}`
  );
}

const isEntrypoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntrypoint) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`DLQ monitor failed: ${message}`);
    process.exitCode = 1;
  });
}
