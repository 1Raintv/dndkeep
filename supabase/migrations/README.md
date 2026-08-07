# supabase/migrations — how this folder works

(The Supabase CLI only reads `*.sql` here; this README is inert.)

- **Once-ness** comes from each database's `supabase_migrations.schema_migrations`
  ledger; **idempotency** (`IF NOT EXISTS` guards) is the seatbelt. New
  migrations must be idempotent — convention since 2026-08-04, see
  docs/CODING_STANDARDS.md.
- **Delivery** (v2.649): push to `test` → CI applies to the TEST project;
  merge to `main` → CI applies to PROD (`.github/workflows/migrate.yml`,
  secret-gated per tier). Local Docker DB: the `/apply-migrations` skill.
  Never `db push` at a hosted DB from a terminal.
- **History note:** this chain was renamed/squashed relative to what prod
  originally applied (prod's ledger was reconciled to match on 2026-08-06 —
  see `.claude/audit/prod-ledger-*.{sql,csv}`). `000`–`003` are baseline/shim
  files reproducing schema whose original migrations no longer exist. The
  squashed seed chunks mean a fresh DB gets schema but NOT the full
  spell/monster catalog — that's a one-time data copy (owner handoff Phase D).
- **Workflow-trigger note:** CI triggers on changes under this folder, so
  adding a migration file is what ships it — no manual dispatch needed.
