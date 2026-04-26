-- v2.275.0 — Phase Q.1 pt 33: server-authoritative wall collision.
--
-- The v2.268 client-side check (src/lib/wallCollision.ts) is a UX
-- guard, not a security boundary: a buggy or malicious client can
-- bypass it by sending an UPDATE directly via supabase-js. This
-- trigger re-validates every UPDATE that moves a token (changes x
-- or y) and rejects the change if the move segment crosses a
-- blocking wall in the same scene.
--
-- Semantics mirror src/lib/wallCollision.ts:
--   - blocks_movement = false → ignored
--   - door_state = 'open'    → ignored (open doors don't block)
--   - segment-vs-segment intersection: open intervals on both sides
--     (t,u ∈ (0,1)) so vertex-grazing and "drop ON the wall line" are
--     both allowed (squeeze-through-corner rule).
--
-- DM bypass: if the calling user owns the scene's campaign, the check
-- is skipped. The DM is authoring; arbitrary placement is legal.
--
-- INSERTs are unrestricted: placing a token across a wall is normal
-- (e.g. enemy in the next room). Only UPDATEs that move an already-
-- placed token through a wall are constrained.

CREATE OR REPLACE FUNCTION public.check_token_movement_against_walls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_scene_owner uuid;
  v_wall record;
  v_denom double precision;
  v_t double precision;
  v_u double precision;
  v_rx double precision;
  v_ry double precision;
  v_sx double precision;
  v_sy double precision;
BEGIN
  -- No-op if neither x nor y changed. Cheap pre-filter for updates
  -- that only touch rotation, color, name, etc.
  IF NEW.x = OLD.x AND NEW.y = OLD.y THEN
    RETURN NEW;
  END IF;

  -- Lookup the scene's owner. The DM is allowed to reposition tokens
  -- arbitrarily during scene authoring — the wall-collision check is
  -- a player-movement guard, not a DM workflow guard.
  SELECT s.owner_id INTO v_scene_owner
    FROM public.scenes s
    WHERE s.id = NEW.scene_id;

  IF v_scene_owner = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Path segment: (OLD.x, OLD.y) → (NEW.x, NEW.y)
  v_rx := NEW.x - OLD.x;
  v_ry := NEW.y - OLD.y;

  FOR v_wall IN
    SELECT x1, y1, x2, y2
      FROM public.scene_walls
      WHERE scene_id = NEW.scene_id
        AND blocks_movement = true
        AND (door_state IS NULL OR door_state <> 'open')
  LOOP
    -- Wall segment: (x1,y1) → (x2,y2). Run the same parametric solve
    -- the client uses. Open intervals on both sides for permissive
    -- vertex-grazing.
    v_sx := v_wall.x2 - v_wall.x1;
    v_sy := v_wall.y2 - v_wall.y1;
    v_denom := v_rx * v_sy - v_ry * v_sx;

    IF abs(v_denom) < 1e-9 THEN
      CONTINUE; -- parallel / collinear: client treats as no crossing
    END IF;

    v_t := ((v_wall.x1 - OLD.x) * v_sy - (v_wall.y1 - OLD.y) * v_sx) / v_denom;
    v_u := ((v_wall.x1 - OLD.x) * v_ry - (v_wall.y1 - OLD.y) * v_rx) / v_denom;

    IF v_t > 0 AND v_t < 1 AND v_u > 0 AND v_u < 1 THEN
      RAISE EXCEPTION 'Token movement blocked by wall (server check)'
        USING ERRCODE = 'check_violation',
              HINT = 'A wall segment lies between the start and end positions; choose a path that goes around it.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scene_tokens_wall_collision_check ON public.scene_tokens;

CREATE TRIGGER scene_tokens_wall_collision_check
  BEFORE UPDATE OF x, y ON public.scene_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.check_token_movement_against_walls();

COMMENT ON FUNCTION public.check_token_movement_against_walls() IS
  'v2.275: server-authoritative wall collision. Re-validates every token move against scene_walls in the same scene. DM (scene owner) bypasses. Mirrors src/lib/wallCollision.ts semantics.';
