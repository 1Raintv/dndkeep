-- v2.297.0 — Repo back-fill. This migration was originally applied
-- to live on 2026-04-14 (version 20260414144026, name
-- 'add_campaign_automation_settings') but never committed to the
-- source tree. v2.297 reconciles that gap for the Automation
-- framework surface specifically. The broader migration-history
-- drift between live and repo (~100 other unbacked migrations
-- predating 20260425) is its own future cleanup.
--
-- IF NOT EXISTS makes the migration safe to re-apply: live already
-- has the column, so this is a no-op there; fresh provisions get
-- the column created with the correct default.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS automation_settings JSONB NOT NULL DEFAULT '{
    "auto_hit_dice": true,
    "auto_damage_dice": true,
    "auto_damage_done": false,
    "auto_condition_tracker": true
  }'::jsonb;
