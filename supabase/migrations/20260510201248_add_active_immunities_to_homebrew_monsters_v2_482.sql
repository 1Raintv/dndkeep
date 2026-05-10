-- v2.482.0 — Add active_immunities to homebrew_monsters.
--
-- Background:
--   The cross-encounter immunity arc (v2.474–v2.479) added an
--   `active_immunities` JSONB column to `characters` and `npcs`,
--   plus the `campaign_condition_immunities` source-of-truth table.
--   The end-of-encounter carry-over (v2.477) snapshots immunity
--   rows onto characters.active_immunities and npcs.active_immunities.
--
--   But the actual DM-facing creature instances on the battle map
--   live in `homebrew_monsters`, not `npcs` — `npcs` is essentially
--   unused outside the v2.477 carry-over write itself. The DM-side
--   NPC quick-panel (NpcTokenQuickPanel.tsx) reads from
--   homebrew_monsters; without an active_immunities column there,
--   the carry-over had nowhere to put creature-side immunity and
--   the quick-panel had no way to display it.
--
-- This migration adds the column. The matching app build (v2.482)
-- extends the carry-over to write here for participant_type='creature'
-- and adds an immunity panel to NpcTokenQuickPanel.

ALTER TABLE public.homebrew_monsters
  ADD COLUMN IF NOT EXISTS active_immunities JSONB NOT NULL DEFAULT '[]'::jsonb;
