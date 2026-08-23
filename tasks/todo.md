# Active Backlog

Keep this file limited to current engineering follow-ups. GitHub issues are the source of truth for the product backlog, pull requests preserve completed work and verification history, and durable agent guidance belongs in `AGENTS.md` or `tasks/lessons.md`.

## Current Follow-ups

### Parallelize and clarify Application CI

- [x] Run quality, unit/integration, schema, and production-build checks in one descriptive lane.
- [x] Run Chromium and iPhone WebKit browser journeys in a parallel descriptive lane.
- [x] Preserve `Verify application` as the required aggregate check and fail it unless both lanes pass.
- [x] Keep the deployment workflow gated on successful `Application CI` for the exact current-main commit.
- [x] Add deterministic workflow contract coverage and run the full verification gate.
- [ ] Merge and confirm the parallel checks and gated production deployment succeed.

Recent main timing was 2m47s: browser installation took 50s, browser journeys 35s, and the remaining chained verification about 63s. Two lanes improve failure visibility and should reduce wall time without duplicating setup once per individual command.

Local verification passed: workflow YAML parsing, three workflow contract tests, the full quality lane (82 files / 649 tests, D1 checks, and production build), seven Chromium/WebKit journeys, and `git diff --check`.

### Resolve the remaining SMS report in issue #256

- [ ] Obtain a current retry result and the expected event/reminder time from the reporter.
- [ ] Check the recorded Twilio delivery status/error code and the member's current SMS consent/opt-out state.
- [ ] Reproduce and fix only if current evidence shows a remaining application defect.

Voting from the original report was fixed and deployed in PR #273. Historical SMS delivery cannot be reconstructed because the report predates per-message delivery tracking; current production evidence is required before changing behavior.

## Deferred Upgrades

### TypeScript 7

- [ ] Reassess when TypeScript 7 exposes the programmatic compiler API required by typescript-eslint and the supported toolchain accepts it.

The project currently uses the official TypeScript 6 compatibility package and passes the TypeScript 7-readiness diagnostic. Do not replace it with the native TypeScript 7 compiler until the API/tooling blocker is resolved.
