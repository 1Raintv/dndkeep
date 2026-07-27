-- v2.632.0 — Heroic Inspiration (2024 PHB / SRD 5.2.1).
-- Boolean by design: RAW, you either have Heroic Inspiration or you
-- don't (it never stacks). Spend to reroll any d20 test; the new
-- roll must be used.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS heroic_inspiration boolean NOT NULL DEFAULT false;
