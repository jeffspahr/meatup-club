# Post-Baseline D1 Migrations

Baseline policy (effective 2026-02-23):

- Use `/Users/jspahr/repo/meatup-club/schema.sql` to bootstrap new databases.
- Legacy pre-baseline migrations were removed from the active tree.
- The current baseline includes the changes represented by migrations through 2026-03-12.
- Add only forward migrations here for changes made after the current baseline snapshot.

Operational rules:

- Existing environments: apply new files in this folder with `wrangler d1 migrations apply`.
- Fresh environments: run `wrangler d1 execute ... --file=../schema.sql`. Do not replay migrations whose changes are already represented in that schema snapshot.
- Do not modify or rewrite applied migration files; add a new migration instead.
