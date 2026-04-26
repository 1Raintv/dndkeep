-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419221501 (name 'add_damage_modifiers') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS damage_resistances text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS damage_immunities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS damage_vulnerabilities text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN characters.damage_resistances IS
  'Damage types the character takes half damage from. Lowercase strings from the 13 RAW types: acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder. Auto-populated from species + manually editable when advanced_edits_unlocked.';
COMMENT ON COLUMN characters.damage_immunities IS
  'Damage types the character takes 0 damage from. Same 13-type vocabulary as damage_resistances.';
COMMENT ON COLUMN characters.damage_vulnerabilities IS
  'Damage types the character takes double damage from. Same 13-type vocabulary as damage_resistances.';
