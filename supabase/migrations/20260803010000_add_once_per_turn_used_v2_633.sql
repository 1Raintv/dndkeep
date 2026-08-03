-- v2.633.0 — Weapon Mastery: Cleave.
--
-- Generic per-turn marker array. Cleared at the start of the
-- participant's own turn in advanceTurn (lib/combatEncounter.ts).
-- Deliberately a text[] rather than a boolean column per feature:
-- Cleave is the first "once per turn" rider, and Sneak Attack and
-- Nick both need the same gate, so they share this array instead of
-- each adding a column.
--
-- Current keys:
--   'weapon_mastery_cleave'  — v2.633, lib/cleave.ts CLEAVE_ONCE_KEY

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS once_per_turn_used TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN combat_participants.once_per_turn_used IS
  'v2.633 — once-per-turn feature markers, cleared at the start of this participant''s turn.';
