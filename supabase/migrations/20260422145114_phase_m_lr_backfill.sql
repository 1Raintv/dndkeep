-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422145114 (name 'phase_m_lr_backfill') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.138.0 — Phase M pt 1: backfill legendary_resistance_count for SRD
-- monsters with a 'Legendary Resistance' trait. In 2014 SRD all LR-bearing
-- creatures use 3/Day. Covers: Adult/Ancient Dragons, Lich, Tarrasque,
-- Vampire forms.
-- Monsters with legendary actions but no LR in SRD (Aboleth, Kraken, Solar,
-- Unicorn, Mummy Lord, Sphinxes) stay at NULL — RAW for SRD.

UPDATE monsters
SET legendary_resistance_count = 3
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(traits) AS t
  WHERE t->>'name' = 'Legendary Resistance'
)
AND legendary_resistance_count IS NULL;
