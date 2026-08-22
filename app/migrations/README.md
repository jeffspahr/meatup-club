# Post-Baseline D1 Migrations

Baseline policy (effective 2026-02-23):

- Use `/Users/jspahr/repo/meatup-club/schema.sql` to bootstrap new databases.
- Legacy pre-baseline migrations were removed from the active tree.
- Add only forward, additive migrations here for changes after the baseline snapshot.

Operational rules:

- Existing environments: apply new files in this folder with `wrangler d1 migrations apply`.
- Fresh environments: run `wrangler d1 execute ... --file=../schema.sql`. The canonical schema already incorporates every migration present in this directory, so do not replay those migrations on top of a fresh baseline.
- Do not modify or rewrite applied migration files; add a new migration instead.

CI verification:

- `npm run test:d1` applies the canonical schema to a fresh local D1 database.
- The same command applies the full forward migration chain to the immutable pre-20260223 fixture and checks schema plus supported data-backfill invariants.
