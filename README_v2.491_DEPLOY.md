# DND 404 — v2.491.0 deploy bundle

Combines two ships:
- **v2.490** — Strip dead `npcs` table references (#4 from prior queue)
- **v2.491** — Creature buff carry-over with end-to-end loop closed (#3 from prior queue)

## Contents

```
src/lib/combatEncounter.ts                         (v2.490 + v2.491 edits)
src/lib/campaignImmunities.ts                      (v2.490 edits)
src/components/Campaign/NpcTokenQuickPanel.tsx     (v2.491 edits)
src/version.ts                                     (2.491.0)
supabase/migrations/20260512182231_add_active_buffs_to_homebrew_monsters_v2_491.sql
```

## How to deploy

1. **Extract this zip from the repo root** — e.g. `C:\dev\DNDKeep`. The
   archive preserves relative paths so files drop into place over your
   working tree.

2. **Migration is already applied to prod.** The SQL file is included so
   fresh-DB deploys and the local repo history stay consistent. No action
   needed against the live DB; `schema_migrations` already has version
   `20260512182231`.

3. **Run your deploy script** — `deploy.bat` from the repo root. It will:
   - tsc --noEmit (gate on TS2304 only — known clean)
   - vite build
   - copy `dist/` into `dndkeep_latest.zip`
   - push to git → Vercel auto-deploys

## What v2.491 actually delivers

A buff applied to a player character or `homebrew_monsters` creature
during combat now:
1. Persists to the authoritative row when combat ends (v2.477 char path,
   new in v2.491 creature path).
2. Renders as an amber chip on `NpcTokenQuickPanel` for DMs between
   fights (creature side; characters already had it on the sheet).
3. **Is re-applied mechanically in the next combat** — `startEncounter`
   and `addParticipantToEncounter` now call
   `seedBuffsFromAuthoritativeTables` after the v2.319 trigger fires.
   This is the gap that was open even for characters pre-v2.491.

## Verification done

- `tsc --noEmit | wc -l` = 299. Identical to pristine v2.489.
  No new TS errors introduced.
- Deploy gate (TS2304) = 0. Clean.
- All 299 baseline errors are from a stale `src/types/supabase.ts` that's
  missing `active_immunities` and `active_buffs` columns on
  `homebrew_monsters`. Future cleanup ship — regenerate via
  `supabase gen types typescript --project-id ufowdrspkprlpdnjjkaj`.

## Rollback

If anything goes sideways:
- Vercel: redeploy the previous deployment (v2.489.0 is the prior live).
- DB: `ALTER TABLE public.homebrew_monsters DROP COLUMN active_buffs;`
  (column added in `20260512182231`). Then delete that row from
  `supabase_migrations.schema_migrations`.

