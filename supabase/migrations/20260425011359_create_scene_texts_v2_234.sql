-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260425011359 (name 'create_scene_texts_v2_234') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.234.0 — Scene text annotations on the battle map.
-- Mirrors scene_walls in shape and RLS: DM (scene owner) has full
-- CRUD; party members can SELECT only when the scene is published.
-- Realtime publication added so all clients see changes live.

create table public.scene_texts (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  x real not null,
  y real not null,
  text text not null default '',
  color text not null default '#ffffff',
  font_size integer not null default 16,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scene_texts_scene_id_idx on public.scene_texts(scene_id);

alter table public.scene_texts enable row level security;

create policy scene_texts_select on public.scene_texts
  for select
  using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_texts.scene_id
        and (
          s.owner_id = (select auth.uid())
          or (
            s.is_published = true
            and exists (
              select 1 from public.campaign_members cm
              where cm.campaign_id = s.campaign_id
                and cm.user_id = (select auth.uid())
            )
          )
        )
    )
  );

create policy scene_texts_insert on public.scene_texts
  for insert
  with check (
    exists (
      select 1 from public.scenes s
      where s.id = scene_texts.scene_id
        and s.owner_id = (select auth.uid())
    )
  );

create policy scene_texts_update on public.scene_texts
  for update
  using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_texts.scene_id
        and s.owner_id = (select auth.uid())
    )
  );

create policy scene_texts_delete on public.scene_texts
  for delete
  using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_texts.scene_id
        and s.owner_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.scene_texts;
