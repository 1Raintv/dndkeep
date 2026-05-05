# Migration Drift Cleanup — Arc Summary

**Status:** Closed at v2.307. Architectural drift fully resolved. Seed-data
back-fill deliberately deferred (rationale below).

## Background

In April 2026 (around v2.297), recon discovered that `live`'s
`supabase_migrations.schema_migrations` table contained ~125 migration
records, while the repo's `supabase/migrations/` directory contained only
15 files. Anyone provisioning a fresh Supabase project from the repo would
get a broken database — schema drift was load-bearing across nearly every
feature shipped from late March through late April.

The cleanup arc spanned ships v2.297 through v2.307 and back-filled all
architectural migrations. The remaining gap is canonical SRD seed data,
which is addressed via a different mechanism (see "Seed Data Boundary"
below).

## What Was Back-Filled

The following 96 migrations were pulled verbatim from
`live`'s `schema_migrations` and committed at their original timestamps.
All use `IF NOT EXISTS` / `DROP POLICY IF EXISTS` / `ON CONFLICT DO NOTHING`
guards, making them no-ops on `live` and clean applies on a fresh DB.

| Ship | Theme | Migration count |
|------|-------|-----------------|
| v2.297 | Automation framework discovery + 2 back-fills | 2 |
| v2.298 | Late-March / early-April infrastructure (RLS recursion, base tables, indexes, realtime fixes, magic items, multiclassing) | 25 |
| v2.299 | Roll logs realtime + reactions, dice skins, party HP visibility, gained feats, feature uses | 9 |
| v2.300 | Spells & monsters tables, advanced edits gates, exhaustion, languages/tools, manual level grants | 14 |
| v2.301 | Combat-state pre-Phase: concentration rounds, damage modifiers, nat 1/20 saves, long rest combat clears, character history audit | 6 |
| v2.302 | Phase A–E combat infrastructure (combat_events, monster license, drawings/versioning, combat state machine, pending attacks/reactions) | 6 |
| v2.303 | Phase F–O combat (cover, multi-target damage, movement/dash, conditions, concentration saves, spell casts, legendary/lair, walls, encumbrance, long rest, ruleset, death saves, scorching ray) | 21 |
| v2.304 | Phase P magic items + Phase Q chat realtime + BattleMap V2 (scenes, tokens, walls, assets bucket) | 11 |
| v2.305 | scene_texts + scene_drawings (final architectural stragglers) | 2 |
| v2.306 | Small spell seeds (chunks 08, 08_final, 04_to_08) — strategic checkpoint | 3 |

Total architectural-equivalent migrations back-filled: 96. Repo
`supabase/migrations/` count went from 15 → 112.

## Seed Data Boundary

The remaining 13 migrations in `live`'s history are SRD seed data inserts
(spell chunks 01–07, monster chunks 01–07). These were **deliberately not
back-filled**. The reasoning:

1. **Already a source of truth elsewhere.** The same canonical SRD content
   lives in `static/spells.ts` and `static/monsters.ts`, which the build
   system already treats as authoritative for any client-side default
   data.
2. **Volume vs. value.** The 13 remaining seed migrations total ~870KB of
   single-statement INSERTs. Adding them to the repo is pure repetition
   of data already present elsewhere, with no future maintenance value
   (they're write-once and never edited).
3. **Different concern.** Schema migrations describe how the database
   evolves over time. Seed data describes a snapshot of canonical
   reference content. These are conventionally separated in
   Postgres-using projects (e.g., `migrations/` vs `seeds/`).

A fresh DB provisioned from the repo will:
- Build the complete app schema correctly via `supabase migration up`
  through migration `20260426210745`.
- Have empty `spells`, `monsters`, and `magic_items` tables (canonical
  rows missing).
- Boot and run, but bestiary / spell pickers will show empty lists until
  seed data is loaded.

## Seeding a Fresh Database

To populate canonical SRD content on a fresh DB after running migrations,
choose one of:

### Option A: Pull from a live DB (recommended)

If you have access to an existing DNDKeep Supabase project with the
canonical data already loaded, dump and restore:

```bash
# From the source project (where data already exists)
pg_dump \
  --data-only \
  --table=public.spells \
  --table=public.monsters \
  --table=public.magic_items \
  --where="owner_id IS NULL" \
  "$SOURCE_DATABASE_URL" \
  > seeds/canonical_srd.sql

# On the fresh DB
psql "$TARGET_DATABASE_URL" < seeds/canonical_srd.sql
```

The `WHERE owner_id IS NULL` filter selects only canonical rows
(homebrew rows are user-owned and shouldn't transfer between
environments).

### Option B: Re-seed from TS source files

The same data lives in `static/spells.ts` and `static/monsters.ts`. Write
a one-time Node script that reads these files and inserts via the
service-role Supabase client. Reference shape: see the static TS files
for canonical types and `lib/api/spells.ts` for an existing
`upsertCanonicalSpells()` pattern.

### Option C: Pull from `supabase_migrations.schema_migrations` directly

The original 13 seed migrations are still recorded on `live`'s
`supabase_migrations.schema_migrations`. A future ship could pull and
back-fill them verbatim if "single source of truth = the migrations
folder" becomes important. Estimated cost: 5–8 mechanical ships of
heredoc/JSON copy-paste at v2.306-style cadence.

## Verification

After running `supabase migration up` on a fresh DB, verify schema
completeness:

```bash
# Compare migration counts
echo "Repo migrations:"
ls supabase/migrations/*.sql | wc -l
# Expected: 112

# After seeding (Option A or B), verify canonical data:
psql "$DATABASE_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM public.spells   WHERE owner_id IS NULL) AS canonical_spells,
    (SELECT COUNT(*) FROM public.monsters WHERE owner_id IS NULL) AS canonical_monsters,
    (SELECT COUNT(*) FROM public.magic_items WHERE owner_id IS NULL) AS canonical_magic_items;
"
# Expected (as of April 2026): ~440 spells, ~334 monsters, ~110 magic items
```

## Why This Matters

Before this arc, the repo's `supabase/migrations/` was effectively
decorative. New developers cloning the repo and running
`supabase start` got a database missing nearly all features shipped
since late March. Now a fresh clone can build a complete schema with
one CLI command, and the seed-data gap is documented with three
explicit remediation paths.

The arc also unblocks future architectural work — Combat unification
Phase 3 (token library refactor) was blocked on the implicit assumption
that schema migrations existed in the repo. They now do.
