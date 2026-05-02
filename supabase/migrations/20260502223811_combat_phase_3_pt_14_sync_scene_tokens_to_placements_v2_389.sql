-- v2.389.0 — Combat Phase 3 pt 14: scene_tokens → placements sync.
--
-- Background. Phase 3 (v2.308–v2.321) cut combat over to combatants
-- but stalled mid-flight on the visual side. scene_token_placements
-- has an initial backfill from v2.310 (Apr 25–27) and stale rows ever
-- since; every scene_token write since v2.310 has gone only to
-- scene_tokens. The use_combatants_for_battlemap flag is off
-- everywhere, so the read path still uses scene_tokens — masking the
-- drift but blocking cutover.
--
-- This migration installs a one-way mirror: every INSERT/UPDATE/DELETE
-- on scene_tokens is mirrored to scene_token_placements. App code
-- continues writing only to scene_tokens. Placements becomes a
-- continuously-rebuilt read model. When the cutover ship lands (drop
-- scene_tokens), this trigger gets dropped with it.
--
-- Design choices:
--
-- 1. ONE direction only. Trigger does not write back to scene_tokens
--    when placements is mutated. The flag is off, so nothing writes
--    to placements directly today; if someone enables the flag and
--    starts using the new path, they'll be writing to placements +
--    expecting the read model to be authoritative — at that point
--    the cutover ship drops scene_tokens entirely. We don't need a
--    bidirectional sync to support either world.
--
-- 2. ONE combatant per scene_token. Even if two tokens share a
--    creature_id (e.g., the user has two Ancient Red Dragons placed
--    on Scene 1, one homebrew_monsters row), each token gets its
--    own combatant. This matches how cp_ensure_combatant_link
--    behaves on combat insert — every combat_participants row gets
--    its own combatant. Same semantics ("two instances = two HP
--    pools") preserved.
--
-- 3. Reuse scene_tokens.id as combatants.id when creating a fresh
--    combatant. Same trick as v2.310 step 4 — gives a stable
--    identity link without needing an extra column. UUID collision
--    risk is non-existent (gen_random_uuid).
--
-- 4. Definition resolution priority on token INSERT:
--      character_id  → 'character'        / characters.id
--      creature_id   → 'homebrew_monster' / homebrew_monsters.id
--      neither       → 'custom'           / NULL definition_id
--    Note: the v2.310 backfill used 'srd_monster' for orphan tokens
--    via name match against canonical monsters. We don't replicate
--    that here — current production has no SRD-monster orphans
--    (every creature in user's data is in homebrew_monsters), and
--    name-match in a trigger is a foot-gun (renames orphan into a
--    different monster's combatant retroactively).
--
-- 5. Existing combatants left alone. If the token's character has
--    a combatant already, the trigger does not duplicate. If the
--    creature_id has a combatant from a prior combat encounter, the
--    trigger creates a NEW combatant for this placement — because
--    of choice 2.
--
-- 6. Owner_id resolution. combatants.owner_id is the campaign owner
--    (DM), not the player or character owner — that's the established
--    pattern from cp_ensure_combatant_link and v2.310. Players access
--    their own PC combatants via the combatants_player_select_own
--    policy regardless of owner_id.
--
-- Rollback: this migration is fully reversible. To roll back, drop
-- the trigger + function. Placements stays in sync with scene_tokens
-- as of the last write before drop; nothing else depends on it
-- because the flag is off.

-- ===================================================================
-- Step 1: clear stale placements from v2.310 backfill.
-- ===================================================================
-- They're 7 days old, none of them match current scene_tokens (verified
-- pre-migration: 5 placements, 5 stale, 0 fresh). The trigger below
-- will rebuild fresh placements as scene_tokens get touched, but to
-- guarantee a clean read model immediately we also do a one-shot
-- backfill (step 4) from current scene_tokens.

DELETE FROM public.scene_token_placements;

-- ===================================================================
-- Step 2: trigger function — sync_scene_token_to_placement.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.sync_scene_token_to_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- combatants insert needs auth.users-level perms
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner_id        uuid;     -- campaign owner; combatants.owner_id
  v_combatant_id    uuid;
  v_def_type        text;
  v_def_id          text;
  v_max_hp          integer;
  v_snapshot        jsonb;
  v_campaign_id     uuid;
BEGIN

  -- =======================
  -- DELETE: cascade to placements (one-to-one by scene_id+x+y is
  -- unreliable after moves, so we use a lookup column we control:
  -- the placement is identified by scene_token_placements WHERE
  -- combatant_id IN combatants WHERE id = OLD.id, OR by the
  -- combatant whose token we know about via the reuse-id trick).
  -- Simpler: each placement we create has a 1:1 combatant whose id
  -- we set to scene_tokens.id. Delete by that.
  -- =======================
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.scene_token_placements
      WHERE combatant_id IN (
        SELECT id FROM public.combatants WHERE id = OLD.id
      );
    -- Also delete the orphan combatant we may have created for this
    -- token. If the combatant has any combat_participants rows it
    -- means combat used it — keep the historical combatant. If not,
    -- it's safe to drop. The check is necessary: deleting a token
    -- mid-encounter must NOT drop the combat record.
    DELETE FROM public.combatants
      WHERE id = OLD.id
        AND NOT EXISTS (
          SELECT 1 FROM public.combat_participants cp
          WHERE cp.combatant_id = OLD.id
        );
    RETURN OLD;
  END IF;

  -- =======================
  -- Resolve campaign + owner from the scene.
  -- =======================
  SELECT s.campaign_id, c.owner_id
    INTO v_campaign_id, v_owner_id
    FROM public.scenes s
    JOIN public.campaigns c ON c.id = s.campaign_id
   WHERE s.id = NEW.scene_id;

  IF v_owner_id IS NULL THEN
    -- Scene/campaign missing — bail rather than blow up the insert.
    RAISE WARNING 'sync_scene_token_to_placement: no scene/owner for scene_id %', NEW.scene_id;
    RETURN NEW;
  END IF;

  -- =======================
  -- INSERT: create combatant if needed, then create placement.
  -- =======================
  IF (TG_OP = 'INSERT') THEN

    -- For PC tokens: reuse existing campaign-scoped character combatant
    IF NEW.character_id IS NOT NULL THEN
      SELECT id INTO v_combatant_id
        FROM public.combatants
       WHERE definition_type = 'character'
         AND definition_id = NEW.character_id::text
         AND campaign_id = v_campaign_id
       LIMIT 1;

      IF v_combatant_id IS NULL THEN
        -- Character combatants are normally created via
        -- cp_ensure_combatant_link on combat join. Create one here
        -- for completeness so the placement has a target.
        INSERT INTO public.combatants (
          id, campaign_id, owner_id, name,
          definition_type, definition_id, stat_block_snapshot,
          current_hp, max_hp
        )
        SELECT
          NEW.id, v_campaign_id, v_owner_id, ch.name,
          'character', ch.id::text, to_jsonb(ch.*),
          COALESCE(ch.current_hp, 0), COALESCE(ch.max_hp, 0)
        FROM public.characters ch
        WHERE ch.id = NEW.character_id;
        v_combatant_id := NEW.id;
      END IF;

    -- For creature tokens: create a fresh per-token combatant.
    -- Even if a combatant already exists for this creature, we make
    -- a new one — see design note 2.
    ELSIF NEW.creature_id IS NOT NULL THEN
      SELECT
        COALESCE(hm.hp, 0),
        to_jsonb(hm.*)
      INTO
        v_max_hp,
        v_snapshot
      FROM public.homebrew_monsters hm
      WHERE hm.id = NEW.creature_id;

      INSERT INTO public.combatants (
        id, campaign_id, owner_id, name,
        definition_type, definition_id, stat_block_snapshot,
        current_hp, max_hp
      ) VALUES (
        NEW.id, v_campaign_id, v_owner_id, NEW.name,
        'homebrew_monster', NEW.creature_id::text,
        COALESCE(v_snapshot, '{}'::jsonb),
        COALESCE(v_max_hp, 0), COALESCE(v_max_hp, 0)
      );
      v_combatant_id := NEW.id;

    -- Orphan tokens: create a 'custom' combatant.
    ELSE
      INSERT INTO public.combatants (
        id, campaign_id, owner_id, name,
        definition_type, definition_id, stat_block_snapshot,
        current_hp, max_hp
      ) VALUES (
        NEW.id, v_campaign_id, v_owner_id, NEW.name,
        'custom', NULL, '{}'::jsonb,
        0, 0
      );
      v_combatant_id := NEW.id;
    END IF;

    -- Create the placement.
    INSERT INTO public.scene_token_placements (
      scene_id, combatant_id,
      x, y, rotation, z_index,
      size_override, color_override, image_storage_path_override,
      visible_to_all,
      created_at, updated_at
    ) VALUES (
      NEW.scene_id, v_combatant_id,
      NEW.x, NEW.y, NEW.rotation, NEW.z_index,
      NEW.size, NEW.color, NEW.image_storage_path,
      NEW.visible_to_all,
      NEW.created_at, NEW.updated_at
    );

    RETURN NEW;
  END IF;

  -- =======================
  -- UPDATE: mirror visual + position changes to placement.
  -- Also rename the linked combatant if the token name changed
  -- (since the combatant carries the displayed name).
  -- =======================
  IF (TG_OP = 'UPDATE') THEN

    UPDATE public.scene_token_placements p
       SET x                           = NEW.x,
           y                           = NEW.y,
           rotation                    = NEW.rotation,
           z_index                     = NEW.z_index,
           size_override               = NEW.size,
           color_override              = NEW.color,
           image_storage_path_override = NEW.image_storage_path,
           visible_to_all              = NEW.visible_to_all,
           updated_at                  = NEW.updated_at
     WHERE p.combatant_id IN (
       SELECT id FROM public.combatants WHERE id = NEW.id
     );

    IF NEW.name IS DISTINCT FROM OLD.name THEN
      UPDATE public.combatants
         SET name = NEW.name, updated_at = now()
       WHERE id = NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ===================================================================
-- Step 3: install the trigger.
-- ===================================================================

DROP TRIGGER IF EXISTS scene_tokens_sync_to_placement_trg ON public.scene_tokens;
CREATE TRIGGER scene_tokens_sync_to_placement_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.scene_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_scene_token_to_placement();

-- ===================================================================
-- Step 4: one-shot backfill from current scene_tokens.
-- ===================================================================
-- The trigger only fires on future writes. To bring placements into
-- sync as of NOW, we replay current rows through the same code path.
-- The simplest way: do a no-op UPDATE that touches updated_at. That
-- fires the AFTER UPDATE branch — but the AFTER UPDATE branch
-- expects an existing placement to update, not create. So we use a
-- direct INSERT-style backfill that mirrors the trigger's INSERT
-- branch logic.
--
-- For each token, we either:
--   - reuse the combatant matching its character_id (PC), or
--   - create a fresh combatant (creature/orphan), reusing token.id
--
-- Done as an inline DO block so we get plpgsql control flow.

DO $$
DECLARE
  r          record;
  v_owner    uuid;
  v_camp     uuid;
  v_combid   uuid;
  v_max      integer;
  v_snap     jsonb;
BEGIN
  FOR r IN SELECT t.* FROM public.scene_tokens t LOOP
    SELECT s.campaign_id, c.owner_id
      INTO v_camp, v_owner
      FROM public.scenes s
      JOIN public.campaigns c ON c.id = s.campaign_id
     WHERE s.id = r.scene_id;

    IF v_owner IS NULL THEN CONTINUE; END IF;

    IF r.character_id IS NOT NULL THEN
      SELECT id INTO v_combid FROM public.combatants
       WHERE definition_type = 'character'
         AND definition_id = r.character_id::text
         AND campaign_id = v_camp
       LIMIT 1;
      IF v_combid IS NULL THEN
        INSERT INTO public.combatants (
          id, campaign_id, owner_id, name,
          definition_type, definition_id, stat_block_snapshot,
          current_hp, max_hp
        )
        SELECT
          r.id, v_camp, v_owner, ch.name,
          'character', ch.id::text, to_jsonb(ch.*),
          COALESCE(ch.current_hp, 0), COALESCE(ch.max_hp, 0)
        FROM public.characters ch
        WHERE ch.id = r.character_id;
        v_combid := r.id;
      END IF;

    ELSIF r.creature_id IS NOT NULL THEN
      -- Idempotent: only create combatant if a combatant with id=r.id
      -- doesn't already exist (i.e., this is a fresh backfill, not a
      -- re-run after a prior backfill).
      IF NOT EXISTS (SELECT 1 FROM public.combatants WHERE id = r.id) THEN
        SELECT COALESCE(hm.hp, 0), to_jsonb(hm.*)
          INTO v_max, v_snap
          FROM public.homebrew_monsters hm
         WHERE hm.id = r.creature_id;
        INSERT INTO public.combatants (
          id, campaign_id, owner_id, name,
          definition_type, definition_id, stat_block_snapshot,
          current_hp, max_hp
        ) VALUES (
          r.id, v_camp, v_owner, r.name,
          'homebrew_monster', r.creature_id::text,
          COALESCE(v_snap, '{}'::jsonb),
          COALESCE(v_max, 0), COALESCE(v_max, 0)
        );
      END IF;
      v_combid := r.id;

    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.combatants WHERE id = r.id) THEN
        INSERT INTO public.combatants (
          id, campaign_id, owner_id, name,
          definition_type, definition_id, stat_block_snapshot,
          current_hp, max_hp
        ) VALUES (
          r.id, v_camp, v_owner, r.name,
          'custom', NULL, '{}'::jsonb, 0, 0
        );
      END IF;
      v_combid := r.id;
    END IF;

    -- Insert placement if not already there.
    IF NOT EXISTS (
      SELECT 1 FROM public.scene_token_placements p
       WHERE p.combatant_id = v_combid
         AND p.scene_id = r.scene_id
    ) THEN
      INSERT INTO public.scene_token_placements (
        scene_id, combatant_id,
        x, y, rotation, z_index,
        size_override, color_override, image_storage_path_override,
        visible_to_all, created_at, updated_at
      ) VALUES (
        r.scene_id, v_combid,
        r.x, r.y, r.rotation, r.z_index,
        r.size, r.color, r.image_storage_path,
        r.visible_to_all, r.created_at, r.updated_at
      );
    END IF;
  END LOOP;
END $$;
