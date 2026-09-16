# Round-two workflow review

Base: origin/main def0a66. Reviewed poll API/admin creation/closure, restaurant voting helpers, dashboard date nomination/voting/deletion, and schema relationships.

## Current findings

- Date nomination persists its suggestion and automatic vote with independent writes. If the vote insert fails, retry sees the retained suggestion as a duplicate.
- Date deletion independently deletes all votes before deleting the nomination, although the schema already provides cascading vote deletion. A failed nomination delete therefore erases votes without removing the date.

## Plan and acceptance

Both failures reproduced against the canonical schema before changing production code. Nomination now batches its insert and automatic vote; removal uses the schema's existing cascading foreign key in a single DELETE. Poll/owner authorization and successful UI responses remain unchanged.

Regression coverage exercises nomination rollback/retry, automatic-vote identity with differing table sequences, deletion rollback preserving two members' votes, successful retry/cascade, and unauthorized deletion.

Cloudflare's current D1 batch contract confirms sequential transactional execution and rollback on a failed statement: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

## Prevention lesson

Treat nomination plus auto-vote as one state change. Avoid manually deleting children before a parent when an existing foreign-key cascade can preserve atomicity. Verify both success and failed second writes with real SQL.

## Verification

- Before the production fix, the two failure-injection tests failed by exposing a stranded nomination and lost votes.
- The four new real-schema route tests and 30 existing poll-action tests pass.
- Full `npm run test:coverage`: 106 test files, 882 tests passed; 83.87% statement and 84.38% line coverage.
- `npm run typecheck`, `npm run lint`, and `git diff --check` passed.
- No schema migration is needed: the existing foreign key already cascades date-vote deletion. D1 batch supplies rollback for nomination plus its automatic vote.
