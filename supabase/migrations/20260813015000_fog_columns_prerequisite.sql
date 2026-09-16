-- v2.696 — prerequisite discovered by the hosted-test catch-up run.
-- Intentionally sorts BEFORE 20260813020000: remembered fog references these
-- columns, but their original creator sorts a day later (20260814000000).
-- Keep both applied historical files immutable. CI --include-all applies this
-- prerequisite on existing tiers too, where IF NOT EXISTS preserves all data.
alter table public.scenes
  add column if not exists fog_mode text not null default 'dynamic',
  add column if not exists revealed_cells jsonb not null default '[]'::jsonb;
