# Active Backlog

Keep this file limited to current engineering follow-ups. GitHub issues are the source of truth for the product backlog, pull requests preserve completed work and verification history, and durable agent guidance belongs in `AGENTS.md` or `tasks/lessons.md`.

## Current Follow-ups

### Resolve the remaining SMS report in issue #256

- [ ] Obtain a current retry result and the expected event/reminder time from the reporter.
- [ ] Check the recorded Twilio delivery status/error code and the member's current SMS consent/opt-out state.
- [ ] Reproduce and fix only if current evidence shows a remaining application defect.

Voting from the original report was fixed and deployed in PR #273. Historical SMS delivery cannot be reconstructed because the report predates per-message delivery tracking; current production evidence is required before changing behavior.

## Deferred Upgrades

### TypeScript 7

- [ ] Reassess when TypeScript 7 exposes the programmatic compiler API required by typescript-eslint and the supported toolchain accepts it.

The project currently uses the official TypeScript 6 compatibility package and passes the TypeScript 7-readiness diagnostic. Do not replace it with the native TypeScript 7 compiler until the API/tooling blocker is resolved.
