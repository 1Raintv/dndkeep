# DND 404 — v2.492.0 deploy bundle (cumulative)

Stacks three ships in one extract:

- **v2.490** — Strip dead `npcs` table references
- **v2.491** — Creature buff carry-over with re-seed loop closed
- **v2.492** — Living NPCs list view inside the NPC tab

## Contents

```
src/lib/combatEncounter.ts                            (v2.490 + v2.491 edits)
src/lib/campaignImmunities.ts                         (v2.490 edits)
src/components/Campaign/NpcTokenQuickPanel.tsx        (v2.491 edits)
src/components/Campaign/LivingNpcsList.tsx            (v2.492 NEW)
src/components/Campaign/CampaignDashboard.tsx         (v2.492 edits — toggle + wiring)
src/version.ts                                        (2.492.0)
supabase/migrations/20260512182231_add_active_buffs_to_homebrew_monsters_v2_491.sql
```

## How to deploy

1. Extract this zip from the repo root (`C:\dev\DNDKeep`). Files drop into
   place over your existing tree.
2. Migration already applied to prod (`schema_migrations` has version
   `20260512182231`). File is included for repo consistency.
3. Run `deploy.bat`.

## What v2.492 delivers

In the **NPCs tab**, a new segmented toggle: **Bestiary | Living NPCs**.

- **Bestiary** (default) — unchanged. Existing `NPCManager`: template
  editor for `homebrew_monsters` with role/faction/relationship/lore.
- **Living NPCs** (new) — reads `combatants` (the persistent per-token
  runtime state from v2.309 Combat Phase 3). Shows every NPC combatant
  in the campaign with:
  - Live HP bar (color-coded green/yellow/red by %)
  - Inline `[amount] [Dmg] [Heal]` buttons per row (DM-only)
  - Dead rows shown grayed out + strikethrough with a "Dead" pill
  - Search by name
  - Realtime sync: HP edits from the map panel, combat damage, and
    end-of-encounter writes update the list instantly

Selection persists per-campaign in `localStorage` (defaults to Bestiary).

## Verification

- `tsc --noEmit | wc -l` = **299** — identical to pristine v2.489.
- Deploy gate (TS2304) = **0**. Clean.
- All 299 are pre-existing baseline from stale `src/types/supabase.ts`
  (missing `active_immunities`, `active_buffs`, and the entire
  `combatants` table definition in generated types). Future cleanup
  ship to regenerate types.

## Rollback

- Vercel: redeploy the previous deployment.
- DB: optional rollback of v2.491 column —
  `ALTER TABLE public.homebrew_monsters DROP COLUMN active_buffs;`
  + delete row from `supabase_migrations.schema_migrations`.

