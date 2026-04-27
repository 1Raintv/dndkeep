-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260425012511 (name 'create_scene_drawings_v2_235') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.235.0 — Scene drawings (freehand pencil + line + rect + circle).
-- Same RLS shape as scene_walls and scene_texts: DM full CRUD,
-- party SELECT on published scenes. Realtime publication added.
-- Drawings are immutable in this ship — delete + create, no update.

create table public.scene_drawings (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  kind text not null check (kind in ('pencil', 'line', 'rect', 'circle')),
  -- Points stored as flat array of [x, y] pairs in jsonb.
  -- Pencil: arbitrary length. Line: 2 pts. Rect: 2 pts (top-left,
  -- bottom-right). Circle: 2 pts (center, edge for radius).
  points jsonb not null default '[]'::jsonb,
  color text not null default '#a78bfa',
  line_width integer not null default 3,
  created_at timestamptz not null default now()
);

create index scene_drawings_scene_id_idx on public.scene_drawings(scene_id);

alter table public.scene_drawings enable row level security;

create policy scene_drawings_select on public.scene_drawings
  for select
  using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_drawings.scene_id
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

create policy scene_drawings_insert on public.scene_drawings
  for insert
  with check (
    exists (
      select 1 from public.scenes s
      where s.id = scene_drawings.scene_id
        and s.owner_id = (select auth.uid())
    )
  );

create policy scene_drawings_delete on public.scene_drawings
  for delete
  using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_drawings.scene_id
        and s.owner_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.scene_drawings;
