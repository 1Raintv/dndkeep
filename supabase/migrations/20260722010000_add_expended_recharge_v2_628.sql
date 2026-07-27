-- v2.628.0 — Recharge auto-roll (RAW "Recharge 5–6").
-- Names of recharge-on-roll actions this participant has expended.
-- Per-encounter combat state, so it lives on combat_participants
-- (alongside legendary_actions_remaining) and dies with the encounter.
ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS expended_recharge text[] NOT NULL DEFAULT '{}';
