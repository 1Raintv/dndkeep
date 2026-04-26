-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260424203201 (name 'v2_223_scene_walls') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.223.0 — Phase Q.1 pt 16 (Phase 3 begin): scene_walls table.
-- Walls are line segments stored as two endpoints in world pixel coords.
-- Powers three future features:
--   v2.224: vision blocking — visibility polygon per token uses walls
--           with blocks_sight=true to clip what each player sees
--   v2.225: fog of war — explored cells revealed via vision
--   v2.226+: doors that open/close, one-way walls, terrain walls
--
-- Schema notes:
--   - x1/y1/x2/y2 as real (float) — drawing snaps to cell corners but
--     allows free placement for irregular curve approximations.
--   - blocks_sight default true (most walls block vision).
--   - blocks_movement default true (most walls block movement); v2.226
--     will add see-through-but-impassable (windows) variants.
--   - door_state nullable — only set on door walls.

CREATE TABLE IF NOT EXISTS public.scene_walls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id        uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  x1              real NOT NULL,
  y1              real NOT NULL,
  x2              real NOT NULL,
  y2              real NOT NULL,
  blocks_sight    boolean NOT NULL DEFAULT true,
  blocks_movement boolean NOT NULL DEFAULT true,
  door_state      text CHECK (door_state IS NULL OR door_state IN ('closed', 'open', 'locked')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scene_walls_scene_id_idx ON public.scene_walls(scene_id);

ALTER TABLE public.scene_walls ENABLE ROW LEVEL SECURITY;

CREATE POLICY scene_walls_select ON public.scene_walls
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_walls.scene_id
        AND (
          s.owner_id = (SELECT auth.uid())
          OR
          (s.is_published = true AND EXISTS (
            SELECT 1 FROM public.campaign_members cm
            WHERE cm.campaign_id = s.campaign_id
              AND cm.user_id = (SELECT auth.uid())
          ))
        )
    )
  );

CREATE POLICY scene_walls_insert ON public.scene_walls
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_walls.scene_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY scene_walls_update ON public.scene_walls
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_walls.scene_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY scene_walls_delete ON public.scene_walls
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_walls.scene_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scene_walls'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.scene_walls';
  END IF;
END $$;
