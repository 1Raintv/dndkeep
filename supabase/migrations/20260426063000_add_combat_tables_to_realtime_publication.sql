-- v2.279.0 — Phase Q.1 pt 34: add combat tables to the realtime publication.
--
-- Discovered while investigating a "Legendary Resistances don't decrement"
-- bug report: the LR badge on the InitiativeStrip stays at the old value
-- after the DM clicks "Spend one." Root cause is broader than LR — six
-- combat-related tables are missing from supabase_realtime, so postgres_changes
-- subscribers receive no events when these tables are mutated:
--
--   combat_encounters       → CombatProvider's encounter sync
--   combat_participants     → CombatProvider's participant sync (LR, HP,
--                             initiative, dash/disengage flags, etc.)
--   combat_events           → CombatEventLog live feed
--   pending_attacks         → AttackResolutionModal +
--                             LegendaryResistancePromptModal
--   pending_death_saves     → DeathSavePromptModal
--   pending_reactions       → ReactionPromptModal +
--                             AttackResolutionModal's reaction sub
--
-- Without realtime broadcasts, every combat action (Dash, Disengage, End
-- Turn, End Combat, manual LR spend, attack/save resolution, death-save
-- prompts, reaction offers) updates the DB correctly but the UI displays
-- stale state until the user manually navigates away and back. This is
-- the most likely explanation for the user's "buttons don't work" report.
--
-- This is a publication-add, not a schema change. RLS policies are
-- already in place and unchanged. Realtime broadcasts go out for any
-- INSERT/UPDATE/DELETE the user has SELECT permission on, gated by
-- the existing RLS — no new exposure surface.

ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_encounters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_attacks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_death_saves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_reactions;
