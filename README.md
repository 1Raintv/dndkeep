# DND 404 — v2.493 Deploy Bundle (cumulative v2.490 → v2.493)

Bumps `APP_VERSION` to **2.493.0**.

This bundle is cumulative across four ships. Apply against any v2.489 checkout.

## Ships included

### v2.490 — Strip dead `npcs` references
The `npcs` table was dropped in v2.350 (`unify_creatures_and_folders`). Stripped 6 dead code paths in `src/lib/combatEncounter.ts` (grouping branch, npcCombatantIds array, immunity prefetch, `npcImmsByTarget` map, `from('npcs').update(...)` write loop, stale comments). In `src/lib/campaignImmunities.ts` annotated `ImmunityTargetType` union so the legacy `'npc'` variant in the DB CHECK is documented as never-written.

### v2.491 — Creature buff carry-over (loop closed)
Added `homebrew_monsters.active_buffs` column (migration `20260512182231_…_v2_491.sql`, already applied to prod via Supabase MCP — `schema_migrations` contains this version, no re-apply needed). Extended `endEncounter` creature loop in `combatEncounter.ts` to write buffs back from `combMap` to the template. Added new helper `seedBuffsFromAuthoritativeTables` called from both `startEncounter` and `addParticipantToEncounter`: re-seeds `combatants.active_buffs` from `characters.active_buffs` / `homebrew_monsters.active_buffs` AFTER the v2.319 trigger fires (the trigger hard-codes `active_buffs = '[]'::jsonb`, which silently broke both character and creature buff persistence). Added amber-themed Active Buffs panel + `removeBuff` handler in `NpcTokenQuickPanel.tsx`.

### v2.492 — Living NPCs list view
New `src/components/Campaign/LivingNpcsList.tsx` reads `combatants` filtered to non-character entries. Realtime sync on UPDATE/INSERT/DELETE filtered by `campaign_id`. Modified `CampaignDashboard.tsx` with a segmented toggle (Bestiary | Living NPCs) persisted to localStorage per-campaign (key `dndkeep:npcSubView:${id}`). Inline `[amount] [Dmg] [Heal]` buttons per row write to `combatants.current_hp`, the same column the combat tracker and `NpcTokenQuickPanel.applyHp` (v2.393) write to. Auto-dead via `is_dead: next <= 0 && max_hp > 0`.

### v2.493 — Regenerate `src/types/supabase.ts`
Full regen via direct SQL introspection of `information_schema.columns` against the production project (`ufowdrspkprlpdnjjkaj`), formatted in-database for the `Tables` block. Drift cleaned:

- **Added** to types: `combatants`, `scene_token_placements` (introduced in v2.309 Combat Phase 3, types had never been regenerated since v2.253).
- **Added columns** to existing tables: `homebrew_monsters.active_immunities` (v2.482), `homebrew_monsters.active_buffs` (v2.491), `characters.active_immunities` (v2.474+), and ~20 others that had accumulated.
- **Removed** dead tables from types: `npcs` (dropped v2.350), `dm_npc_roster` (dropped earlier).
- **Updated** column nullability and defaults across most tables to match current DB.

Stripped two `(supabase as any)` casts in `LivingNpcsList.tsx` where the now-typed `combatants` table takes primitive-only updates. Other casts kept — they involve jsonb writes of typed object arrays (`ActiveImmunity[]`, `ActiveBuff[]`, condition source maps) which don't auto-narrow to the `Json` union without an unsafe cast, matching the existing ~60-site codebase pattern.

## TSC baseline impact
- Before: **299** total errors, **0** TS2304.
- After: **306** total errors, **0** TS2304.
- Deploy gate (TS2304) still passes.
- Net +7 errors are real type mismatches between hand-written `Character` / `Campaign` / `AutomationSettings` interfaces and the now-correct DB shapes. These were previously hidden by missing tables/columns in the types file. **Not a regression in functionality** — they were latent issues.
- A separate future ship can replace hand-written domain interfaces with `TableRow<'characters'>` etc., or add proper type narrowing. Not in scope for v2.493.

## Files in this bundle
```
src/components/Campaign/CampaignDashboard.tsx    (v2.492 — NPC sub-view toggle)
src/components/Campaign/LivingNpcsList.tsx       (NEW v2.492)
src/components/Campaign/NpcTokenQuickPanel.tsx   (v2.491 buff panel)
src/lib/campaignImmunities.ts                    (v2.490 cleanup)
src/lib/combatEncounter.ts                       (v2.490 + v2.491)
src/types/supabase.ts                            (v2.493 regenerated)
src/version.ts                                   (2.493.0)
supabase/migrations/20260512182231_add_active_buffs_to_homebrew_monsters_v2_491.sql
```

## Apply order
1. Drop files in place over a v2.489 checkout.
2. The migration is already applied in production (verified via Supabase MCP); no `supabase db push` needed for the prod DB. For fresh local DBs the migration will run automatically.
3. Run `npm run build` (or `deploy.bat`); tsc gate requires only TS2304=0.

## Still pending after v2.493
- Live UI smoke tests for all four ships (browser access blocked from this session).
- E2E immunity + buff persistence verification on the dnd404 test campaign.
- Decision on whether Advance Time should decrement `active_buffs[].duration` (matters now that buffs persist).
- Combat Phase 3 token library refactor (multi-session arc).
