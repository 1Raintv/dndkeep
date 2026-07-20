-- v2.605.0 — Persist the slot level a concentration spell was cast at,
-- so recurring-effect prompts (v2.597/v2.601) can scale dice on upcast
-- (Spiritual Weapon at 4th = 2d8 + MOD; Heat Metal at 3rd = 3d8).
-- NULL = not concentrating or unknown (pre-v2.605 rows) — readers fall
-- back to the spell's base level. Applied to prod 2026-07-20 via
-- Supabase MCP apply_migration.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS concentration_slot_level integer;
