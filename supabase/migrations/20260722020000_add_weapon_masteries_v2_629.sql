-- v2.629.0 — Weapon Mastery (2024 PHB / SRD 5.2.1).
-- Canonical weapon names the character has chosen mastery in.
-- Slot count scales by class/level (masterySlots in
-- src/data/weaponMastery.ts); swap cadence is one change per Long
-- Rest, tracked via feature_uses like the Wild Shape swap.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS weapon_masteries text[] NOT NULL DEFAULT '{}';
