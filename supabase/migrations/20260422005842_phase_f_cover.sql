-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422005842 (name 'phase_f_cover') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase F v2.103.0 — cover state
-- Two levels:
--   1) Per-attack cover_level on pending_attacks — used for this resolution
--   2) Persistent persistent_cover jsonb on combat_participants — DM-set
--      per-attacker default for this target. Shape:
--        { [attackerParticipantId]: 'half' | 'three_quarters' | 'total' }

ALTER TABLE pending_attacks
  ADD COLUMN IF NOT EXISTS cover_level TEXT
    CHECK (cover_level IN ('none','half','three_quarters','total') OR cover_level IS NULL);

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS persistent_cover JSONB NOT NULL DEFAULT '{}'::jsonb;
