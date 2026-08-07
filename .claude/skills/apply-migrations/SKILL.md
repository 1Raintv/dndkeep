---
name: apply-migrations
description: Apply pending DNDKeep database migrations — local Docker DB directly, prod via the gated CI workflow or Dashboard paste. Use when I say /apply-migrations, "apply/run the migrations", "is the db schema up to date", or a new file lands in supabase/migrations/.
argument-hint: [local (default) | prod | status]
---

# apply-migrations

Get `supabase/migrations/` applied to a database, safely. **Local is the
default and the only target this skill touches directly** — prod applies
go through the CI workflow or the owner's Dashboard, never a raw
connection string typed into a session.

## Steps

1. **Target?** No argument or `local` → local Docker DB. `status` → step 2
   only. `prod` → step 5 only. Never infer prod from ambient wording —
   it must be the explicit argument.
   — *done when:* target named.

2. **Status** — what's pending:
   `npx supabase migration list --local` (needs the local stack up; if
   the connection errors, `npx supabase start` first — Docker Desktop
   must be running). Local vs remote columns show the ledger state.
   — *done when:* pending set known (empty = report "up to date", stop).

3. **Apply (local)** — `npx supabase migration up`. The
   `schema_migrations` ledger makes this apply only never-run files;
   re-running is a no-op. NEVER pass `--linked` or `--db-url` here.
   — *done when:* CLI reports applied files (or none pending).

4. **Verify** — re-run `migration list` (pending set now empty) plus a
   probe of whatever the newest migration created (e.g.
   `docker exec supabase_db_dndkeep psql -U postgres -d postgres -c
   "select 1 from <new_table> limit 1"`). For pg_cron migrations check
   `cron.job` — those WARN instead of failing when the extension is off.
   — *done when:* probe passes, or the discrepancy is reported.

5. **Prod** — two sanctioned routes, in order of preference:
   - **CI**: `.github/workflows/migrate.yml` is two-tier (v2.649): push to
     `test` applies to the TEST Supabase project (`SUPABASE_DB_URL_TEST`),
     merge to `main` applies to PROD (`SUPABASE_DB_URL`) — each tier a
     no-op until its secret is set. Hosted applies go through branches,
     never a local CLI push. Check the latest "Apply Migrations" run (`gh run list
     --workflow "Apply Migrations"`): a "SKIPPED" notice means the
     secret (and its prerequisite ledger baseline — see reference) isn't
     done yet.
   - **Dashboard paste** (until CI is enabled): give the user the
     pending files IN FILENAME ORDER to paste into Supabase Dashboard →
     SQL Editor, plus a verify query per file. Files are idempotent by
     convention — safe to re-run.
   — *done when:* the route's outcome is confirmed (run green / user
   confirms paste + verify), or handed to the owner with exact steps.

## Reference

- **The ledger baseline is a hard prerequisite for CI prod applies.**
  Prod's schema predates most migration files; until the one-time
  `supabase migration repair` marks historical files applied (owner
  sit-down, needs the prod DB password), an unbaselined `db push` would
  replay the whole chain. The workflow's secret-gate encodes this: no
  secret, no push. Do not work around it.
- Manual Dashboard applies don't write prod's ledger — track them for
  inclusion in the eventual baseline (owner queue notes which).
- `npx supabase db reset` = wipe + replay + seed (destroys local data,
  including any personal test kit). `migration up` = incremental, keeps
  data. Default to `migration up`.
- New migrations: idempotent (`IF NOT EXISTS` guards), per
  docs/CODING_STANDARDS.md — the ledger is the once-ness mechanism,
  guards are the seatbelt.

## Gotchas

> Observed 2026-08-05, first run.

- **`migration list` WITHOUT `--local` demands a linked project**
  (LegacyProjectNotLinkedError) — it wants to compare against hosted.
  This repo is deliberately unlinked; always pass `--local`.
- `supabase migration list` against a stopped stack gives a connection
  error that LOOKS like "no migrations" in some CLI versions — confirm
  the stack is up before reading results.
- After DDL lands, PostgREST's schema cache refresh isn't instant —
  telemetry's sink retries after its dormancy window (PGRST205 is
  expected briefly), don't diagnose that as a failed migration.

> Observed 2026-08-07, first prod CI apply.

- **`workflow_dispatch` only sees workflows on the DEFAULT branch** — a
  migrate.yml living only on a feature branch can't be dispatched by name
  or filename (404). Push events DO read the workflow from the pushed ref.
  This repo's push-webhook delivery also flakes (~4 observed misses) —
  when a push should have triggered a run and didn't, `gh workflow run
  migrate.yml --ref <branch>` is the reliable kick.
- **Out-of-order pending files** (older timestamp than the ledger's newest
  row — e.g. a branch merging late) make plain `db push` refuse. The CI
  workflow passes `--include-all` for exactly this; if running locally,
  add it too. Apply order stays oldest-first either way.
- Connection-string secrets: session-pooler host, port **5432** (not
  6543), real password with URL-special characters percent-encoded —
  `[YOUR-PASSWORD]` left in place is a parse error, not an auth error.
