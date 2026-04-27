-- v2.312.0 — Combat Phase 3 pt 4: BattleMap swap foundation.
-- See docs/COMBAT_PHASE_3_TOKEN_LIBRARY.md.
--
-- ADDITIVE ONLY — no behavior change. This ship adds:
--   1. campaigns.use_combatants_for_battlemap feature flag (default false)
--   2. Wall-collision trigger on scene_token_placements (reuses existing
--      check_token_movement_against_walls function — both tables share
--      the same x/y/scene_id columns referenced by the function)
--   3. bump_updated_at BEFORE UPDATE triggers on scene_token_placements
--      and combatants — keeps updated_at fresh without app-side noise
--
-- v2.313 wires BattleMapV2 to call the new placement path when the
-- flag is on. Until then, this ship is invisible to the running app.

-- ===================================================================
-- Step 1: feature flag column
-- ===================================================================

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS use_combatants_for_battlemap boolean
    NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.use_combatants_for_battlemap IS
  'Combat Phase 3 feature flag. When true, BattleMapV2 reads/writes '
  'tokens via scene_token_placements + combatants instead of '
  'scene_tokens. Off by default during the v2.313+ rollout. DM toggles '
  'in campaign settings.';

-- ===================================================================
-- Step 2: wall-collision trigger on placements
-- ===================================================================
-- Reuse the existing check_token_movement_against_walls function. Its
-- body only references OLD/NEW.x, .y, .scene_id and reads scene_walls
-- via NEW.scene_id — all generic between scene_tokens and
-- scene_token_placements. No function change needed; just attach.

DROP TRIGGER IF EXISTS scene_token_placements_wall_collision_check
  ON public.scene_token_placements;
CREATE TRIGGER scene_token_placements_wall_collision_check
  BEFORE UPDATE OF x, y ON public.scene_token_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.check_token_movement_against_walls();

-- ===================================================================
-- Step 3: updated_at bump triggers
-- ===================================================================

DROP TRIGGER IF EXISTS trg_scene_token_placements_updated_at
  ON public.scene_token_placements;
CREATE TRIGGER trg_scene_token_placements_updated_at
  BEFORE UPDATE ON public.scene_token_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_updated_at();

DROP TRIGGER IF EXISTS trg_combatants_updated_at
  ON public.combatants;
CREATE TRIGGER trg_combatants_updated_at
  BEFORE UPDATE ON public.combatants
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_updated_at();
