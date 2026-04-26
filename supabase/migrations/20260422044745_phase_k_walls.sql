-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422044745 (name 'phase_k_walls') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase K v2.130.0 — walls for line-of-sight calculations.
-- Distinct from battle_maps.drawings (decorative) because walls carry
-- game-mechanical meaning: v2.131+ LoS queries test segment-segment
-- intersection against this column to auto-derive cover.
-- Shape: [{id: string, x1: number, y1: number, x2: number, y2: number}, ...]
-- Coords are in map-local pixels (same as drawings + tokens).

ALTER TABLE battle_maps
  ADD COLUMN IF NOT EXISTS walls JSONB NOT NULL DEFAULT '[]'::jsonb;
