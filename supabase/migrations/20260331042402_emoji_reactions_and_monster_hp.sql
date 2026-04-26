-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331042402 (name 'emoji_reactions_and_monster_hp') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


-- Emoji reactions on action log entries
CREATE TABLE IF NOT EXISTS action_log_reactions (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  log_id uuid REFERENCES action_logs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  character_name text NOT NULL DEFAULT '',
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(log_id, user_id, emoji)
);

ALTER TABLE action_log_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone in campaign can read reactions"
  ON action_log_reactions FOR SELECT USING (true);

CREATE POLICY "Users manage own reactions"
  ON action_log_reactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reactions_log_id ON action_log_reactions(log_id);

-- Monster HP tracking: add hp columns to session_states combatants (stored in JSONB)
-- The initiative_order JSONB already exists, we just need to ensure monster_hp is tracked there
-- No schema change needed - we'll store it in the existing initiative_order JSONB
