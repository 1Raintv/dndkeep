-- v2.517.0 — Entitlements schema (Build 1). ALREADY APPLIED via MCP.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ultimate_campaign boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS extra_campaign_slots integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS scene_limit integer NOT NULL DEFAULT 10;
