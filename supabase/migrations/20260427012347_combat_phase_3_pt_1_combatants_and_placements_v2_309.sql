
-- v2.309.0 — Combat Phase 3 pt 1: combatants + scene_token_placements.
-- See docs/COMBAT_PHASE_3_TOKEN_LIBRARY.md for the design.
-- ADDITIVE ONLY — new tables sit empty. v2.310 backfills, v2.311 wires
-- combat_participants. Client unchanged through v2.311.

-- ===================================================================
-- Stage 1: tables (no policies yet — policies cross-reference, so
-- both tables must exist before any policy is declared)
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.combatants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  owner_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name                  text NOT NULL,
  portrait_storage_path text,

  -- definition_id is text because it can hold uuid (characters.id,
  -- dm_npc_roster.id) or slug (monsters.id like 'goblin'). 'custom'
  -- rows have NULL definition_id.
  definition_type       text NOT NULL CHECK (definition_type IN (
                          'character', 'srd_monster', 'homebrew_monster',
                          'roster_npc', 'custom'
                        )),
  definition_id         text,
  stat_block_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Persistent runtime state (survives encounter end). Per-encounter
  -- state stays on combat_participants when v2.311 wires the link.
  current_hp            integer NOT NULL DEFAULT 0,
  max_hp                integer NOT NULL DEFAULT 0,
  temp_hp               integer NOT NULL DEFAULT 0 CHECK (temp_hp >= 0),
  ac_override           integer,
  speed_override        integer,
  active_conditions     text[] NOT NULL DEFAULT ARRAY[]::text[],
  condition_sources     jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_buffs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  exhaustion_level      integer NOT NULL DEFAULT 0
    CHECK (exhaustion_level >= 0 AND exhaustion_level <= 10),
  death_save_successes  integer NOT NULL DEFAULT 0
    CHECK (death_save_successes >= 0 AND death_save_successes <= 3),
  death_save_failures   integer NOT NULL DEFAULT 0
    CHECK (death_save_failures >= 0 AND death_save_failures <= 3),
  is_stable             boolean NOT NULL DEFAULT false,
  is_dead               boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_used_at          timestamptz
);

CREATE INDEX IF NOT EXISTS combatants_campaign_idx
  ON public.combatants(campaign_id);
CREATE INDEX IF NOT EXISTS combatants_owner_idx
  ON public.combatants(owner_id);
CREATE INDEX IF NOT EXISTS combatants_definition_idx
  ON public.combatants(definition_type, definition_id)
  WHERE definition_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.scene_token_placements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id                    uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  combatant_id                uuid NOT NULL REFERENCES public.combatants(id) ON DELETE CASCADE,

  x                           real NOT NULL DEFAULT 0,
  y                           real NOT NULL DEFAULT 0,
  rotation                    real NOT NULL DEFAULT 0,
  z_index                     integer NOT NULL DEFAULT 0,

  -- Per-placement overrides. NULL = inherit from combatant. Lets the
  -- DM render the same combatant at different size/color in different
  -- scenes without forking identity.
  size_override               text CHECK (size_override IS NULL OR size_override IN (
                                'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'
                              )),
  color_override              integer,
  image_storage_path_override text,

  visible_to_all              boolean NOT NULL DEFAULT true,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scene_token_placements_scene_idx
  ON public.scene_token_placements(scene_id);
CREATE INDEX IF NOT EXISTS scene_token_placements_combatant_idx
  ON public.scene_token_placements(combatant_id);

-- ===================================================================
-- Stage 2: RLS — both tables enabled, then policies declared
-- ===================================================================

ALTER TABLE public.combatants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_token_placements ENABLE ROW LEVEL SECURITY;

-- DM (campaign owner) full CRUD on combatants in their campaigns.
CREATE POLICY combatants_dm_all ON public.combatants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = combatants.campaign_id
        AND c.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = combatants.campaign_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

-- Players SELECT their own PC combatant (character-sheet HP sync).
CREATE POLICY combatants_player_select_own ON public.combatants
  FOR SELECT
  USING (
    definition_type = 'character'
    AND definition_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id::text = combatants.definition_id
        AND ch.user_id = (SELECT auth.uid())
    )
  );

-- Players SELECT combatants linked to placements they can see — what
-- lets BattleMap render token names/HP for visible enemy tokens.
CREATE POLICY combatants_player_select_via_placement ON public.combatants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.scene_token_placements p
      JOIN public.scenes s ON s.id = p.scene_id
      JOIN public.campaign_members cm ON cm.campaign_id = s.campaign_id
      WHERE p.combatant_id = combatants.id
        AND s.is_published = true
        AND cm.user_id = (SELECT auth.uid())
        AND p.visible_to_all = true
    )
  );

-- DM (scene owner) full CRUD on placements in their scenes.
CREATE POLICY scene_token_placements_dm_all ON public.scene_token_placements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_token_placements.scene_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_token_placements.scene_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- Players SELECT placements on published scenes they're a member of,
-- visible_to_all only. Mirrors scene_tokens RLS.
CREATE POLICY scene_token_placements_player_select ON public.scene_token_placements
  FOR SELECT
  USING (
    visible_to_all = true
    AND EXISTS (
      SELECT 1 FROM public.scenes s
      JOIN public.campaign_members cm ON cm.campaign_id = s.campaign_id
      WHERE s.id = scene_token_placements.scene_id
        AND s.is_published = true
        AND cm.user_id = (SELECT auth.uid())
    )
  );

-- ===================================================================
-- Stage 3: Realtime publication
-- ===================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'combatants'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.combatants';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scene_token_placements'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.scene_token_placements';
  END IF;
END $$;
