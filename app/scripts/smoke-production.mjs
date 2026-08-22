const DEFAULT_ORIGIN = "https://meatup.club";
const DEFAULT_WWW_ORIGIN = "https://www.meatup.club";
const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);

function parsePositiveInteger(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function normalizeOrigin(name, fallback) {
  const value = process.env[name] ?? fallback;
  const url = new URL(value);

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) origin without a path, query, or fragment`);
  }

  return url.origin;
}

const origin = normalizeOrigin("SMOKE_ORIGIN", DEFAULT_ORIGIN);
const wwwOrigin = normalizeOrigin("SMOKE_WWW_ORIGIN", DEFAULT_WWW_ORIGIN);
const attempts = parsePositiveInteger("SMOKE_ATTEMPTS", 6);
const retryDelayMs = parsePositiveInteger("SMOKE_RETRY_DELAY_MS", 10_000);
const timeoutMs = parsePositiveInteger("SMOKE_TIMEOUT_MS", 10_000);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: { "user-agent": "meatup-club-deploy-smoke/1.0" },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyHtml(pathname) {
  const url = new URL(pathname, origin);
  const response = await request(url);

  if (response.status !== 200) {
    throw new Error(`${url} returned HTTP ${response.status}; expected 200`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`${url} returned ${contentType || "no content type"}; expected HTML`);
  }

  const body = await response.text();
  if (body.trim().length === 0) {
    throw new Error(`${url} returned an empty HTML response`);
  }
}

async function verifyWwwRedirect() {
  const url = new URL("/", wwwOrigin);
  const response = await request(url);

  if (!REDIRECT_STATUSES.has(response.status)) {
    throw new Error(`${url} returned HTTP ${response.status}; expected a permanent or temporary redirect`);
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`${url} did not include a Location header`);
  }

  const destination = new URL(location, url);
  const expectedDestination = new URL("/", origin);
  if (destination.href !== expectedDestination.href) {
    throw new Error(`${url} redirected to ${destination.href}; expected ${expectedDestination.href}`);
  }
}

async function verifyProduction() {
  await verifyHtml("/");
  await verifyHtml("/verification");
  await verifyWwwRedirect();
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verifyProduction();
    console.log(`Production smoke check passed on attempt ${attempt}/${attempts}.`);
    process.exitCode = 0;
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Production smoke check attempt ${attempt}/${attempts} failed: ${message}`);

    if (attempt === attempts) {
      console.error("Production smoke check failed after all retry attempts.");
      process.exitCode = 1;
      break;
    }

    await wait(retryDelayMs);
  }
}
