-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260420132831 (name 'create_character_history_audit_log') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


-- v2.75.0: permanent character audit log. Append-only from user's
-- perspective (no DELETE/UPDATE policies), persists forever.
create table if not exists public.character_history (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_character_history_character_created
  on public.character_history (character_id, created_at desc);

alter table public.character_history enable row level security;

drop policy if exists "owner_select_character_history" on public.character_history;
create policy "owner_select_character_history" on public.character_history
  for select using (user_id = auth.uid());

drop policy if exists "owner_insert_character_history" on public.character_history;
create policy "owner_insert_character_history" on public.character_history
  for insert with check (user_id = auth.uid());

-- No UPDATE or DELETE policies — append-only by design.
-- Character deletion cascades (ON DELETE CASCADE on character_id).
