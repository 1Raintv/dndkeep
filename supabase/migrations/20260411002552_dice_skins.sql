-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260411002552 (name 'dice_skins') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


create table if not exists public.dice_skin_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skin_id text not null,
  unlocked_at timestamptz default now(),
  stripe_payment_intent text,
  unique(user_id, skin_id)
);
alter table public.dice_skin_unlocks enable row level security;
create policy "Users see own unlocks" on public.dice_skin_unlocks
  for select using (auth.uid() = user_id);
create policy "Users insert own unlocks" on public.dice_skin_unlocks
  for insert with check (auth.uid() = user_id);

alter table public.profiles add column if not exists active_dice_skin text default 'classic';
