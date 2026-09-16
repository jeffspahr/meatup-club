# Post-Baseline D1 Migrations

Baseline policy (effective 2026-02-23):

- Use `/Users/jspahr/repo/meatup-club/schema.sql` to bootstrap new databases.
- Legacy pre-baseline migrations were removed from the active tree.
- The current baseline includes the changes represented by migrations through 2026-09-16.
- Add only forward migrations here for changes made after the current baseline snapshot.

Operational rules:

- Existing environments: apply new files in this folder with `wrangler d1 migrations apply`.
- Fresh environments: run `wrangler d1 execute ... --file=../schema.sql`. Do not replay migrations whose changes are already represented in that schema snapshot.
- Do not modify or rewrite applied migration files; add a new migration instead.

## Session version rollout (20260916)

Apply `20260916_add_user_session_version.sql` to existing environments before
deploying the code that uses session versions. The deployment workflow does not
apply D1 migrations automatically. The migration keeps ordinary accounts at
generation zero so existing cookies remain valid, and assigns generation one to
accounts already marked `requires_reauth = 1` so those revocations remain effective.

Keep the application PR in draft until the production migration has completed.
Confirm that `users.session_version` exists with a non-null default of zero, and
that accounts still marked `requires_reauth = 1` have a nonzero generation. Then
mark the PR ready and merge after required CI passes. Do not replay the `ALTER
TABLE` migration if the column already exists; inspect migration history first.

If rolling back the application, leave the additive column in place. Older code
does not enforce session generations, so application rollback also removes the
durable-revocation guarantee until the fixed code is deployed again.
