-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260424155131 (name 'v2_213_scene_tokens_color') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.213.0 — Phase Q.1 pt 6: add `color` column to scene_tokens.
-- The Zustand Token type carried `color` since v2.211 but the DB didn't.
-- v2.213 wires tokens to Supabase persistence. Stored as integer
-- (0xRRGGBB). When v2.215 adds image portraits, color is the fallback
-- visual for tokens without one.

ALTER TABLE public.scene_tokens
    ADD COLUMN IF NOT EXISTS color integer NOT NULL DEFAULT 10971642; -- 0xA78BFA
