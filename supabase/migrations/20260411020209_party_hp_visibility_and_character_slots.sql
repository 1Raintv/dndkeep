-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260411020209 (name 'party_hp_visibility_and_character_slots') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


alter table public.campaigns
  add column if not exists hp_visibility_mode text not null default 'hidden'
  check (hp_visibility_mode in ('hidden','exact','states'));

alter table public.profiles
  add column if not exists extra_character_slots integer not null default 0;

alter table public.campaign_chat
  add column if not exists roll_total integer,
  add column if not exists roll_label text;
