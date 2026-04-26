-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422013729 (name 'phase_h_condition_sources') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase H v2.110.0 — condition source tracking.
-- Shape: { [conditionName]: { source: string, casterParticipantId?: string } }
-- Examples:
--   {"Restrained":  {"source":"spell:hold_person", "casterParticipantId":"uuid"}}
--   {"Prone":       {"source":"cascade:Unconscious"}}
--   {"Frightened":  {"source":"monster:dragon:frightful_presence"}}
-- Used by Phase H v2.111 concentration-break cleanup to find/remove
-- conditions whose source was a concentration spell that just dropped.

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS condition_sources JSONB NOT NULL DEFAULT '{}'::jsonb;
