-- v2.295.0 — Combat-system Phase 2e (final). Drops the four legacy
-- combat columns from session_states. The migration arc:
--   v2.286: retired the legacy Start Combat UI surfaces
--   v2.291: migrated DMScreen reads to combat_encounters
--   v2.292: migrated DMlobby HP/condition writes to characters table
--           (also fixed silent bug — DM HP edits weren't propagating)
--   v2.293: migrated NpcTokenQuickPanel initiative writes to
--           combat_participants
--   v2.294: migrated CharacterSheet "Your Turn" banner to useCombat()
--           (also fixed silent bug — banner had been broken since v2.286)
--   v2.295: drops the columns no live code reads or writes anymore
--
-- Modern combat lives entirely on combat_encounters +
-- combat_participants + their associated pending_attacks /
-- pending_death_saves / pending_reactions tables. The session_states
-- table itself is kept as a 3-column shell (id / campaign_id /
-- updated_at) so existing CampaignContext plumbing keeps compiling
-- without coupling this ship to a wider TypeScript cleanup of the
-- vestigial sessionState prop chain through DMScreen / DMlobby /
-- NpcTokenQuickPanel / BattleMapV2. That cleanup can land as its own
-- ship; it's purely cosmetic now that the columns are gone.

ALTER TABLE public.session_states DROP COLUMN IF EXISTS initiative_order;
ALTER TABLE public.session_states DROP COLUMN IF EXISTS current_turn;
ALTER TABLE public.session_states DROP COLUMN IF EXISTS round;
ALTER TABLE public.session_states DROP COLUMN IF EXISTS combat_active;
