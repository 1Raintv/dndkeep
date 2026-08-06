# Owner handoff — stand up the test tier + enable CI prod migrations

> **For the repo owner's Claude session.** Self-contained: everything needed is
> in this doc plus `prod-ledger-baseline.sql` next to it. Written 2026-08-06 from
> the `audit-fixes` branch. Kyle's session handles the code side; this doc is the
> dashboard/secrets side that needs the owner's accounts.

## Target architecture (agreed 2026-08-06)

| Tier | DB | Deploy | Migrations applied by |
|---|---|---|---|
| Local dev | Docker Supabase (`.env.local`) | `npm run dev` | `/apply-migrations` skill |
| `test` branch | **NEW** free Supabase project | Vercel preview | CI (`migrate.yml`) on push to `test` |
| `main` | Prod Supabase | Vercel production | CI (`migrate.yml`) on merge to `main` |

`.github/workflows/migrate.yml` (on `audit-fixes`) already routes by branch:
`test` → secret `SUPABASE_DB_URL_TEST`, `main` → secret `SUPABASE_DB_URL`.
Each tier is a clean no-op until its secret exists — **the secrets are the
on-switches, and Phase C's must not be flipped before Phase B.**

## Phase A — test tier (safe, do anytime, ~15 min of dashboard clicks)

1. **Create the test Supabase project**: https://database.new → same org as prod,
   free tier (the org's 2nd free slot — $0). Name: `dndkeep-test`. Set and save a
   database password.
2. From the new project collect three values:
   - Settings → API → **Project URL** and **`anon` key**
   - Settings → Database → **Connection string (URI)**, the *direct* one
     (port 5432), with the password filled in.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions).
   Owner pastes these into the GitHub UI directly — connection strings and keys
   should not travel through a chat session:
   - `SUPABASE_DB_URL_TEST` = the connection string
   - `SUPABASE_URL_TEST` = the Project URL (for the keep-warm ping)
   - `SUPABASE_ANON_KEY_TEST` = the anon key (for the keep-warm ping)
   - **Do NOT create `SUPABASE_DB_URL` yet** — that is Phase C, after Phase B.
4. **Vercel** (project → Settings → Environment Variables): set the **Preview**
   environment's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to the *test*
   project's values. Production keeps prod's values. This is the moment preview
   deployments stop touching the prod database.
5. **Test project auth**: Authentication → URL Configuration → add the Vercel
   preview URL pattern (e.g. `https://*-<team-slug>.vercel.app/**`) and the main
   preview domain to Redirect URLs, so login works on previews.
6. Tell Kyle's session Phase A is done. It will create the `test` branch and the
   first CI run will replay the full 153-file migration chain into the empty test
   DB (that first run takes several minutes — later runs apply only new files).

## Phase B — prod ledger baseline (the one careful step)

**Why:** prod's schema was built before the migration-file convention, so prod's
`supabase_migrations.schema_migrations` ledger is empty/missing. If CI ran
`supabase db push` against prod now, it would try to replay all ~150 files onto
tables that already exist. The baseline marks every historical file as
already-applied, so the first real push applies only the two new telemetry
migrations (`20260804120000_client_errors`, `20260804160000_client_errors_retention`).

**B1 — pre-flight: confirm prod actually has the newest schema.** The baseline
asserts "prod already reflects all 151 historical files" — verify, don't assume.
In the **prod** Dashboard SQL editor:

```sql
-- All three must return a row / true. If any fails, STOP and tell Kyle's
-- session — it means prod is missing more than the two telemetry files and
-- the baseline list needs adjusting.
select column_name from information_schema.columns
  where table_name = 'combat_participants' and column_name = 'once_per_turn_used';
select column_name from information_schema.columns
  where table_name = 'profiles' and column_name = 'show_ua_content';
select proname from pg_proc where proname = 'keep_warm';
```

Also confirm with the owner directly: has every schema change up through app
v2.633 been applied to prod (however it was applied at the time)? Any
dashboard-only changes made since 2026-08-03 that never became a migration file?

**B2 — run the baseline.** Open `.claude/audit/prod-ledger-baseline.sql` (same
folder as this doc), paste the whole thing into the **prod** Dashboard SQL
editor, run it. It is idempotent (`if not exists` / `on conflict do nothing`).

**B3 — verify.** The script's tail queries should show:
- count = **151**
- zero rows with version like `20260804%`

## Phase C — flip prod CI on (only after B3 passes)

1. GitHub → repo secrets → add `SUPABASE_DB_URL` = **prod** connection string
   (Settings → Database → Connection string URI, direct/5432, password filled).
   Same rule: paste it into the GitHub UI, not into a chat.
2. Done. No dispatch needed: when the `audit-fixes` PR merges into `main`, the
   `Apply Migrations` workflow fires (the PR adds files under
   `supabase/migrations/`), the dry-run step logs exactly the two client_errors
   files, and the apply runs them. Watch that run's log; then verify in prod:

```sql
select 1 from client_errors limit 1;                      -- table exists (0 rows is fine)
select jobname from cron.job where jobname = 'client_errors_retention';  -- retention scheduled (may be absent if pg_cron is off — that migration warns instead of failing; report which)
```

## Report back to Kyle's session

- Phase A done (secrets named exactly as above? Vercel Preview repointed?)
- B1 spot-checks: all passed, or which failed
- B3: ledger count observed
- Phase C: secret set; after merge — did dry-run list exactly 2 files? Did
  `cron.job` show the retention job (i.e., is pg_cron enabled on prod)?

## Do-NOTs (encoded in the workflow, but belt-and-suspenders)

- Never `supabase db push` / `db reset` against prod from a terminal — prod
  applies go through the CI workflow only.
- Don't set `SUPABASE_DB_URL` before B3 passes.
- Don't run the baseline against the TEST project — its ledger must stay empty
  so the first push builds the full schema.
