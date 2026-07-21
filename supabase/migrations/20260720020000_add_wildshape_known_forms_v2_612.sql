-- v2.612.0 — Phase A1 of playable-forms arc: per-character Wild Shape
-- known-forms list (2024 RAW: 4 known at L2, 6 at L4, 8 at L8; chosen
-- from eligible Beast stat blocks). Stores monster ids (text slugs).
-- Applied to prod 2026-07-20 via Supabase MCP apply_migration.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS wildshape_known_forms jsonb NOT NULL DEFAULT '[]'::jsonb;
