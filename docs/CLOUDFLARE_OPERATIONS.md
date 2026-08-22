# Cloudflare Operations

This runbook describes the production resources that support Meatup.Club and
the safe inspection, deployment, rollback, backup, and incident-response paths.
Run Wrangler commands from `app/` with the repository's installed CLI:

```bash
npx wrangler --version
npx wrangler whoami
```

Never paste tokens or secret values into command arguments, logs, issues, or
commits. `wrangler secret list` returns names and types only; it does not reveal
values.

## Ownership boundary

- `app/wrangler.toml` is the repository source of truth for the Worker code,
  static assets, D1 and Queue bindings, non-secret variables, compatibility
  settings, and cron schedule.
- GitHub Actions is the production deployment path. A successful
  `Verify application` check on the current `main` commit triggers a Wrangler
  deployment of that exact commit.
- Account- and zone-level resources are managed in the Cloudflare dashboard,
  outside this repository. This includes DNS records, custom-domain routes,
  the `www` redirect, TLS settings, and creation/deletion of the D1 database and
  queues. Inspect live state before changing any of them.

## Live inventory

Read-only inspection on 2026-08-22 confirmed:

| Resource | Live state | Authoritative check |
| --- | --- | --- |
| Worker | `meatup-club`; version 327 was the active 100% deployment | `npx wrangler deployments list --name meatup-club` |
| D1 | `meatup-club-db`; ID matches `wrangler.toml`; 21 tables; ENAM region; read replication disabled | `npx wrangler d1 info meatup-club-db` |
| Queue | `meatup-club-email-delivery`; one producer and one consumer | `npx wrangler queues list` |
| Dead-letter queue | `meatup-club-email-delivery-dlq` | `npx wrangler queues list` |
| Cron | Every 15 minutes (`*/15 * * * *`) | `app/wrangler.toml` |
| Public endpoint | `https://meatup.club/` and `/verification` return `200` over HTTPS | `curl --fail --head https://meatup.club/verification` |
| Redirect | `https://www.meatup.club/` returns `301` to `https://meatup.club/` | `curl --head https://www.meatup.club/` |

The Worker currently has these secret names: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY`, `RESEND_API_KEY`,
`RESEND_WEBHOOK_SECRET`, `SESSION_SECRET`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. Confirm the current list with:

```bash
npx wrangler secret list --name meatup-club
```

Inventory observations are a point-in-time record, not desired-state
automation. Re-run the read-only commands before an operational change.

## Deploy and verify

Normal production deployment is automatic:

1. Merge a reviewed change to `main`.
2. Confirm `Application CI / Verify application` succeeds for that commit.
3. Confirm `Deploy to Cloudflare Workers` checks out the same SHA, builds it,
   and runs Wrangler.
4. Confirm the workflow's post-deploy smoke check passes for the apex site,
   verification page, and `www` redirect.

For diagnosis, compare live deployments and versions without changing state:

```bash
npx wrangler deployments list --name meatup-club
npx wrangler versions list --name meatup-club
```

`npm run deploy` is an intentional manual production deployment and first runs
the full verification gate. Prefer the GitHub workflow so the deployed SHA and
check history remain visible together.

## Rollback

The preferred rollback is a Git revert on `main`: review the revert, allow the
required application check to pass, and let the normal exact-SHA deployment run.
This restores code and repository configuration together.

For an active production incident where waiting for CI is unsafe, an operator
may roll the Worker back to a previously inspected version:

```bash
npx wrangler versions list --name meatup-club
npx wrangler rollback VERSION_ID --name meatup-club --message "Incident rollback: REASON"
```

Wrangler asks for confirmation. Record the selected version and reason, run the
production smoke check, and then create a repository revert or forward fix so
the next normal deployment does not silently reintroduce the bad version.
A Worker rollback does not roll back D1 schema or data.

## D1 backup and recovery

Before a risky data or schema operation, export the remote database to a secure,
access-controlled location outside the repository:

```bash
npx wrangler d1 export meatup-club-db --remote --output /secure/path/meatup-club-YYYY-MM-DD.sql
```

The export contains private member and event data. Do not place it in the
repository, ordinary cloud drives, chat, or CI artifacts. Verify the file is
non-empty and restrict access immediately. Recovery should be rehearsed against
a separate D1 database; do not import into production until the target and
recovery point have been reviewed.

`schema.sql` is the canonical fresh-install baseline. Files in `app/migrations/`
are forward migrations for existing environments; they are not a substitute for
a data backup.

## Secret rotation

List names, identify every consumer, and rotate one credential at a time. Set a
secret through Wrangler's interactive prompt so its value is not recorded in
shell history:

```bash
npx wrangler secret put SECRET_NAME --name meatup-club
```

After rotation, verify the affected integration and inspect recent Worker logs.
Revoke the old provider credential only after the new value is working. Never
delete or replace unrelated secrets during a rotation.

## Incident checks

1. Check the production smoke command from `app/`: `npm run smoke:production`.
2. Compare the current `main` SHA with the latest successful GitHub deployment.
3. Inspect recent versions and deployments with the read-only commands above.
4. Tail errors without logging request bodies or private data:
   `npx wrangler tail meatup-club --status error`.
5. Check D1 availability with `npx wrangler d1 info meatup-club-db` and Queue
   presence with `npx wrangler queues list`.
6. If email delivery is affected, inspect the primary queue and dead-letter
   queue in the dashboard before retrying messages.
7. Decide between a Git revert, a forward fix, or an emergency Worker rollback;
   record the decision and its verification evidence.

## Worker availability and runtime-error alerting

The `Monitor Worker health` GitHub workflow runs at 7, 22, 37, and 52 minutes
past each hour and can also be started manually. It checks two independent
signals:

- three consecutive synthetic requests to the apex page, verification page,
  and `www` redirect; and
- Cloudflare GraphQL Analytics for any `meatup-club` Worker invocation errors
  during the previous 30 minutes.

An availability failure or error count of at least one opens a single issue
titled `[Operations] Worker availability or runtime errors`. Overlapping query
windows keep the issue open through short scheduling delays. The workflow adds
a recovery comment and closes the issue only after the synthetic check is
healthy and the error count is zero.

The live account's Free plan does not expose Workers error notifications,
standalone Health Checks, or configurable HTTP error-rate notifications.
Rate-based alerts would also be unreliable for this low-traffic application,
so the absolute synthetic and invocation-error signals are intentional.

Workers Logs are enabled at 100% sampling because this is a low-volume private
Worker. Invocation logs are disabled so request URLs and query parameters are
not retained. Server-side application logging uses static event names and error
classes only; do not add raw errors, request/provider payloads, member details,
URLs, or identifiers to console output.

The monitor uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. In addition
to its deployment permissions, the token must have account-level
`Account Analytics: Read`. A GraphQL authentication, schema, or response error
fails the workflow without closing an existing incident. The repository
`GITHUB_TOKEN` is limited to `contents: read` and `issues: write`.

## Email dead-letter queue alerting

The `Monitor email delivery DLQ` GitHub workflow runs every 15 minutes and can
also be started manually. It resolves the DLQ by its exact queue name, then
reads Cloudflare's realtime Queue metrics endpoint. The endpoint returns a
best-effort point-in-time backlog count, byte count, and oldest-message time.

When the backlog is non-zero, the workflow opens one GitHub issue titled
`[Operations] Email delivery DLQ backlog`. Later checks leave that issue open
without creating duplicates. When the backlog returns to zero, the workflow
adds a resolution comment and closes every matching open incident. A later,
distinct backlog creates a new issue, preserving incident history.

The workflow requires the existing `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` GitHub Actions secrets. The API token needs only
account-level Queues Read (or Workers Scripts Read) permission. The repository
`GITHUB_TOKEN` is scoped to `contents: read` and `issues: write` for this
workflow. The monitor never pulls, acknowledges, purges, deletes, or replays a
queue message.

The application records a terminal provider failure in D1 and keeps its Queue
message unacknowledged. Later Queue attempts see the failed state and do not
send to the provider again; they only exhaust Cloudflare's configured retry
budget so Cloudflare moves the message to the DLQ. This makes the failed
delivery independently observable without duplicate email sends. Unhandled
consumer failures follow the same retry-to-DLQ path.

Treat a zero backlog as a recovery signal, not proof that every delivery was
successfully replayed. Review the delivery records and provider status before
closing any related user-impact investigation.
