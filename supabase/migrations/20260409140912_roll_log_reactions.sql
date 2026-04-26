-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260409140912 (name 'roll_log_reactions') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS roll_log_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_id uuid NOT NULL REFERENCES roll_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_name text NOT NULL DEFAULT '',
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(roll_id, user_id)
);

ALTER TABLE roll_log_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roll_log_reactions: anyone can view"
  ON roll_log_reactions FOR SELECT USING (true);

CREATE POLICY "roll_log_reactions: own insert"
  ON roll_log_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "roll_log_reactions: own update"
  ON roll_log_reactions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "roll_log_reactions: own delete"
  ON roll_log_reactions FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE roll_log_reactions;
ALTER TABLE roll_log_reactions REPLICA IDENTITY FULL;
