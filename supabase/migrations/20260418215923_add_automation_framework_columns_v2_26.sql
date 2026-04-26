-- v2.297.0 — Repo back-fill. This migration was originally applied
-- to live on 2026-04-18 (version 20260418215923, name
-- 'add_automation_framework_columns_v2_26') but never committed to
-- the source tree. v2.297 reconciles that gap so the Automation
-- framework surface is fully self-contained in the repo. SQL below
-- is verbatim from supabase_migrations.schema_migrations on the
-- live database.
--
-- IF NOT EXISTS makes the migration safe to re-apply: live already
-- has all three columns, so this is a no-op there; fresh provisions
-- get them created with the correct shapes and comments.
--
-- Original shipping notes (preserved verbatim):
-- v2.26.0 — Automation framework foundation
-- Three-tier override: DM campaign default → player unlock → per-character setting.
-- Each automation key stores one of: 'off' | 'prompt' | 'auto'.
-- First automation: 'concentration_on_damage'.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS automation_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS automation_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS advanced_automations_unlocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.automation_defaults IS
  'Per-campaign DM automation defaults. Shape: { [automationKey]: "off" | "prompt" | "auto" }. Used as fallback when a character hasn''t unlocked custom automations or hasn''t set their own value for that key.';

COMMENT ON COLUMN public.characters.automation_overrides IS
  'Per-character automation overrides. Only applied when advanced_automations_unlocked = true. Shape: { [automationKey]: "off" | "prompt" | "auto" }. Keys absent here fall through to the campaign default.';

COMMENT ON COLUMN public.characters.advanced_automations_unlocked IS
  'Gate for player-set automation overrides. When false (default), the character inherits all DM campaign defaults. When true, entries in automation_overrides take precedence.';
