# Owner handoff — stand up the test tier + enable CI prod migrations

> **✅ COMPLETE 2026-08-07.** All phases executed: ledger reconciled (150),
> test tier bootstrapped + converged, PR #1 merged, 4 migrations CI-applied
> to prod, verify green, column diff byte-identical, backup table dropped.
> Kept for the record. Still open (non-blocking): Vercel Preview repoint
> and the Phase D catalog copy.

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

## Phase B — prod ledger RECONCILIATION (updated 2026-08-06 after the dump)

**What changed:** the B1 pre-flight found prod's ledger is NOT empty — it holds
**169 rows** from an earlier CLI-linked era, and the repo's migration history
was renamed/squashed after those applies. Diff (computed from the actual dump):
109 versions match exactly; 60 rows are prod-only (old timestamps + 15 squashed
spell/monster seed chunks); 44 files are repo-only (renamed stamps, the
`000`–`003` baseline/shim files, the drift shims, telemetry). All schema
effects of the prod-only rows are reproduced by the repo chain — verified
against a from-scratch local build.

**Why deletes are required:** `supabase db push` *errors out* when the remote
ledger holds versions with no matching local file — an insert-only baseline
would not unblock CI. The script therefore deletes the 60 stale rows and
inserts the 41 missing ones (44 repo-only files minus the three
deliberately-pending ones), inside a
transaction with a hard assert: if the end state isn't **exactly 150 rows**,
everything rolls back.

**Deliberately left pending** (CI applies them on the `audit-fixes` merge —
all idempotent):
- `20260509184735_drop_cp_concentration_spell_id_v2_471` — never ran on prod
  (no ledger row under any name); vestigial-column drop, `DROP COLUMN IF EXISTS`.
  NOTE (2026-08-07): on its own this would NOT keep the column gone — the
  drift shim `20260803990000` (authored from prod, which still had the column)
  re-adds it later in the chain. The convergence migration below lands the
  final drop.
- `20260804120000_client_errors`, `20260804160000_client_errors_retention`.
- `20260807000000_converge_drop_dead_npc_and_concentration_orphans` (added
  2026-08-07 from the owner-side column diff): drops the dead NPC cluster
  (`npcs`, `dm_npc_roster`, `scene_tokens.npc_id` — dropped from prod
  out-of-band ~v2.350, but re-created by any chain replay) and finally lands
  the concentration-column drop after the shim's re-add. Already applied to
  the TEST project (CI run 31200635239); no-ops on prod except the
  concentration column.

**B2 — run it.** Open `.claude/audit/prod-ledger-baseline.sql` (regenerated as
the reconciliation, same filename), paste the whole thing into the **prod**
Dashboard SQL editor, run it. Safe to re-run.

**B3 — verify.** The script's tail queries should show:
- count = **exactly 150**
- the three pending versions query returns **0 rows**

If the transaction aborts with the "expected exactly 150" exception, nothing
was changed — send Kyle's session the count it reported and stop.

## Phase C — flip prod CI on (only after B3 passes)

0. **Enable pg_cron on prod first** (found missing 2026-08-06): Dashboard →
   Database → Extensions → search `pg_cron` → enable. Do this BEFORE the merge
   so the `client_errors_retention` migration schedules its 30-day purge on
   first apply instead of warning past it (it warns-not-fails by design, so a
   missing extension is silent — the `cron.job` verify below is the catch).
1. GitHub → repo secrets → add `SUPABASE_DB_URL` = **prod** connection string
   (Settings → Database → Connection string URI, direct/5432, password filled).
   Same rule: paste it into the GitHub UI, not into a chat.
2. Done. No dispatch needed: when the `audit-fixes` PR merges into `main`, the
   `Apply Migrations` workflow fires (the PR adds files under
   `supabase/migrations/`), the dry-run step logs exactly **four** files
   (`drop_cp_concentration_spell_id_v2_471`, the two `client_errors` ones,
   and the `20260807000000_converge_…` migration), and the apply runs them.
   Watch that run's log; then verify in prod:

```sql
select 1 from client_errors limit 1;                      -- table exists (0 rows is fine)
select jobname from cron.job where jobname = 'client_errors_retention';  -- retention scheduled (may be absent if pg_cron is off — that migration warns instead of failing; report which)
select count(*) from information_schema.columns
  where table_name = 'combat_participants' and column_name = 'concentration_spell_id';  -- 0 = the vestigial column is gone
```

## Cleanup (after the first prod CI apply proves out)

The reconciliation's pre-change snapshot lives at
`supabase_migrations.schema_migrations_backup_20260806` (169 rows, outside
`public` so it's invisible to the table editor). Keep it until the first CI
apply has run green, then drop it.

## Phase D — one-time catalog copy to the test DB (after its bootstrap)

The repo's migration chain rebuilds prod's **schema** but not its **catalog
data**: the original spell/monster seed chunks were squashed out of the repo,
so a fresh DB gets ~32 spells / 6 monsters vs prod's full catalog. Once Kyle's
session confirms the test DB is bootstrapped, export from prod and import to
test (either Dashboard CSV export/import per table, or `pg_dump --data-only
--table public.spells --table public.monsters` piped to the test DB — owner's
machine, owner's credentials). Tables: `spells`, `monsters` (add others if the
app shows missing reference data on the test tier).

## Report back to Kyle's session

- Phase A done (secrets named exactly as above? Vercel Preview repointed?)
- B3: ledger count observed (must be exactly 150)
- Phase C: secret set; after merge — did dry-run list exactly 4 files? Did
  a fresh prod-vs-test column diff come back CLEAN (both have client_errors,
  neither has the NPC cluster or concentration_spell_id)? Did
  `cron.job` show the retention job (i.e., is pg_cron enabled on prod)?

## Do-NOTs (encoded in the workflow, but belt-and-suspenders)

- Never `supabase db push` / `db reset` against prod from a terminal — prod
  applies go through the CI workflow only.
- Don't set `SUPABASE_DB_URL` before B3 passes.
- Don't run the baseline against the TEST project — its ledger must stay empty
  so the first push builds the full schema.
