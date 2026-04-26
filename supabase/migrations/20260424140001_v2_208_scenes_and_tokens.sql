-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260424140001 (name 'v2_208_scenes_and_tokens') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation tables.
-- `scenes` is the v2 equivalent of `battle_maps`. Namespaced under `scenes`
-- to keep v1 surface area intact while the new PixiJS renderer is built
-- in parallel behind a feature flag.
-- `scene_tokens` is a separate table (not jsonb) so future phases can:
--   (a) add real-time Postgres Changes per-token subs
--   (b) add RLS-based per-player visibility filtering
--   (c) easy token-level indexes

CREATE TABLE IF NOT EXISTS public.scenes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            text NOT NULL DEFAULT 'Untitled Scene',
    grid_type       text NOT NULL DEFAULT 'square' CHECK (grid_type IN ('square', 'hex_pointy', 'hex_flat', 'none')),
    grid_size_px    integer NOT NULL DEFAULT 70 CHECK (grid_size_px > 0),
    width_cells     integer NOT NULL DEFAULT 30 CHECK (width_cells > 0),
    height_cells    integer NOT NULL DEFAULT 20 CHECK (height_cells > 0),
    background_storage_path text,
    dm_notes        text,
    is_published    boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenes_campaign_id_idx ON public.scenes(campaign_id);

CREATE TABLE IF NOT EXISTS public.scene_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id        uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
    x               real NOT NULL DEFAULT 0,
    y               real NOT NULL DEFAULT 0,
    size            text NOT NULL DEFAULT 'medium' CHECK (size IN ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan')),
    rotation        real NOT NULL DEFAULT 0,
    image_storage_path text,
    name            text NOT NULL DEFAULT '',
    character_id    uuid REFERENCES public.characters(id) ON DELETE SET NULL,
    npc_id          uuid REFERENCES public.npcs(id) ON DELETE SET NULL,
    player_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    visible_to_all  boolean NOT NULL DEFAULT true,
    z_index         integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scene_tokens_scene_id_idx ON public.scene_tokens(scene_id);
CREATE INDEX IF NOT EXISTS scene_tokens_player_id_idx ON public.scene_tokens(player_id);

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY scenes_select ON public.scenes
    FOR SELECT
    USING (
        owner_id = (SELECT auth.uid())
        OR
        (is_published = true AND EXISTS (
            SELECT 1 FROM public.campaign_members cm
            WHERE cm.campaign_id = scenes.campaign_id
              AND cm.user_id = (SELECT auth.uid())
        ))
    );

CREATE POLICY scenes_insert ON public.scenes
    FOR INSERT
    WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = scenes.campaign_id
              AND c.owner_id = (SELECT auth.uid())
        )
    );

CREATE POLICY scenes_update ON public.scenes
    FOR UPDATE
    USING (owner_id = (SELECT auth.uid()))
    WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY scenes_delete ON public.scenes
    FOR DELETE
    USING (owner_id = (SELECT auth.uid()));

ALTER TABLE public.scene_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY scene_tokens_select ON public.scene_tokens
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.scenes s
            WHERE s.id = scene_tokens.scene_id
              AND (
                  s.owner_id = (SELECT auth.uid())
                  OR
                  (s.is_published = true AND EXISTS (
                      SELECT 1 FROM public.campaign_members cm
                      WHERE cm.campaign_id = s.campaign_id
                        AND cm.user_id = (SELECT auth.uid())
                  ) AND (
                      scene_tokens.visible_to_all = true
                      OR scene_tokens.player_id = (SELECT auth.uid())
                  ))
              )
        )
    );

CREATE POLICY scene_tokens_insert ON public.scene_tokens
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.scenes s
            WHERE s.id = scene_tokens.scene_id
              AND s.owner_id = (SELECT auth.uid())
        )
    );

CREATE POLICY scene_tokens_update ON public.scene_tokens
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.scenes s
            WHERE s.id = scene_tokens.scene_id
              AND (
                  s.owner_id = (SELECT auth.uid())
                  OR
                  scene_tokens.player_id = (SELECT auth.uid())
              )
        )
    );

CREATE POLICY scene_tokens_delete ON public.scene_tokens
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.scenes s
            WHERE s.id = scene_tokens.scene_id
              AND s.owner_id = (SELECT auth.uid())
        )
    );
