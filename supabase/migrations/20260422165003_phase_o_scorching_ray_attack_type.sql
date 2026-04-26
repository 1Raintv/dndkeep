-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422165003 (name 'phase_o_scorching_ray_attack_type') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.149.0 — Phase O pt 2: repair Scorching Ray's attack_type.
-- RAW 2024 PHB: 'Make a ranged spell attack for each ray.' The SRD import
-- left attack_type=null, miscategorizing it (parser falls through to save/
-- utility branches; attack-roll pipeline never fires). Matches Eldritch
-- Blast, Fire Bolt, Ray of Frost, etc.
-- damage_dice stays '2d6' (per ray, not cumulative).

UPDATE spells
   SET attack_type = 'ranged',
       updated_at  = NOW()
 WHERE name = 'Scorching Ray'
   AND attack_type IS NULL;
