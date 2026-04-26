-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260423035616 (name 'phase_q_campaign_chat_realtime_rls') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.160.0 — Phase Q.0 pt 1: announcement display bug fix.
-- ROOT CAUSE (two independent bugs):
--   1. campaign_chat was NOT in the supabase_realtime publication, so
--      INSERT events never broadcast to subscribers. Players' realtime
--      subscriptions in CharacterSheet were silently silent.
--   2. RLS was enabled on the table with ZERO policies defined, which
--      defaults to deny-all for non-owner queries.

ALTER PUBLICATION supabase_realtime ADD TABLE campaign_chat;

CREATE POLICY campaign_chat_select_members ON campaign_chat
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_chat.campaign_id AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM characters ch
      WHERE ch.campaign_id = campaign_chat.campaign_id
        AND ch.user_id = auth.uid()
    )
  );

CREATE POLICY campaign_chat_insert_members ON campaign_chat
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = campaign_chat.campaign_id AND c.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM characters ch
        WHERE ch.campaign_id = campaign_chat.campaign_id
          AND ch.user_id = auth.uid()
      )
    )
  );

-- No UPDATE or DELETE policies — chat history is append-only.
