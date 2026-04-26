-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260408224527 (name 'fix_characters_realtime') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


ALTER PUBLICATION supabase_realtime ADD TABLE characters;
ALTER TABLE characters REPLICA IDENTITY FULL;
ALTER TABLE battle_maps REPLICA IDENTITY FULL;
ALTER TABLE campaigns REPLICA IDENTITY FULL;
ALTER TABLE session_states REPLICA IDENTITY FULL;
ALTER TABLE campaign_members REPLICA IDENTITY FULL;
ALTER TABLE roll_requests REPLICA IDENTITY FULL;
ALTER TABLE token_notes REPLICA IDENTITY FULL;
