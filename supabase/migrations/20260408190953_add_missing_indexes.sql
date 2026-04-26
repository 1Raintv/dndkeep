-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260408190953 (name 'add_missing_indexes') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_campaign_id ON characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner_id ON campaigns(owner_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign_id ON campaign_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id ON campaign_members(user_id);
CREATE INDEX IF NOT EXISTS idx_roll_logs_character_id ON roll_logs(character_id);
CREATE INDEX IF NOT EXISTS idx_roll_logs_campaign_id ON roll_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_roll_logs_user_id ON roll_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_campaign_id ON action_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_maps_campaign_id ON battle_maps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign_id ON npcs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_token_notes_campaign_id ON token_notes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_token_notes_token_key ON token_notes(token_key);
CREATE INDEX IF NOT EXISTS idx_dm_npc_roster_owner_id ON dm_npc_roster(owner_id);
CREATE INDEX IF NOT EXISTS idx_session_states_campaign_id ON session_states(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_chat_campaign_id ON campaign_chat(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_chat_created_at ON campaign_chat(created_at DESC);
