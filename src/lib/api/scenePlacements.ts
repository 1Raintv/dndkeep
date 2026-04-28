// v2.312.0 — Combat Phase 3 pt 4: scene_token_placements API.
//
// Parallel surface to sceneTokens.ts that reads/writes via the new
// placement + combatant model from v2.309–v2.311. BattleMapV2 starts
// calling this path in v2.313 when the campaign's
// use_combatants_for_battlemap flag is on; until then, this file is
// not yet wired anywhere.
//
// The Token shape returned matches what battleMapStore expects —
// combatant data is JOINed and projected onto the same fields. The
// new optional combatantId field on Token is populated here so the
// BattleMap can reference the combatant for cross-feature flows
// (combat encounter participation, stat-block editor, etc.).
//
// Position updates fire the wall-collision trigger (added v2.312 to
// scene_token_placements via the existing
// check_token_movement_against_walls function), so the discriminated
// UpdatePlacementPosResult mirrors sceneTokens.UpdateTokenPosResult.
//
// Override columns on the placement table fall through to the
// combatant when null. The current backfill (v2.310) sets every
// placement's size/color/image_storage_path overrides explicitly to
// preserve fidelity, so the read path doesn't need to consult the
// combatant for those visuals during the transition. v2.315+ cleanup
// can null out redundant overrides.
//
// IMPORTANT: deletePlacement only removes the placement, not the
// combatant. Combatants persist beyond a single scene by design —
// the same combatant might be on another scene, in a combat
// encounter, or just retained for narrative continuity. Pruning
// orphan combatants is a separate operation (v2.315+).

import { supabase } from '../supabase';
import type { Token, TokenSize } from '../stores/battleMapStore';

// supabase-js types are generated from a snapshot of the live schema.
// The Phase 3 tables (combatants, scene_token_placements) and the
// campaigns.use_combatants_for_battlemap column landed in v2.309–v2.312
// after the last type generation. Cast supabase here to drop strict
// table-name checking for the new tables. Regenerate via
// `supabase gen types typescript` to remove this workaround (planned
// for the v2.315 cleanup ship).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// JOINed shape from list query. The `combatants:combatant_id` shape
// matches Supabase's PostgREST FK-based join syntax.
interface PlacementJoinRow {
  id: string;
  scene_id: string;
  combatant_id: string;
  x: number;
  y: number;
  rotation: number | null;
  z_index: number;
  size_override: string | null;
  color_override: number | null;
  image_storage_path_override: string | null;
  visible_to_all: boolean | null;
  combatants: {
    id: string;
    name: string;
    portrait_storage_path: string | null;
    definition_type: string;
    definition_id: string | null;
  } | null;
}

/** Convert a placement+combatant joined row to the Zustand Token shape. */
export function joinedRowToToken(row: PlacementJoinRow): Token {
  // size: prefer placement override (always set during v2.310 backfill).
  // Fallback to 'medium' so the BattleMap render never sees null.
  // v2.315+ cleanup may null out matching overrides — we'd then need
  // to derive size from the combatant's definition snapshot. Until
  // then, the override is authoritative.
  const size = (row.size_override ?? 'medium') as TokenSize;
  // color: same fallback model. 0xa78bfa is the app purple default
  // used by sceneTokens.ts.
  const color = row.color_override ?? 0xa78bfa;
  const imagePath = row.image_storage_path_override ?? null;

  // characterId / npcId derived from combatant.definition_type for
  // backward compat with all the BattleMap call sites that branch on
  // these. The combatant's definition_id holds the right value
  // (characters.id::text or npcs.id::text) by construction.
  const characterId =
    row.combatants?.definition_type === 'character'
      ? row.combatants.definition_id ?? null
      : null;
  const npcId =
    row.combatants?.definition_type === 'narrative_npc'
      ? row.combatants.definition_id ?? null
      : null;
  // v2.354.0: creatureId for the unified creature path. Any combatant
  // with a non-character definition_type points at homebrew_monsters
  // (post-v2.350 unification). Mirror npcId into creatureId when the
  // legacy narrative_npc path was used so downstream renders work.
  const creatureId =
    row.combatants && row.combatants.definition_type !== 'character'
      ? row.combatants.definition_id ?? null
      : null;

  return {
    id: row.id,
    sceneId: row.scene_id,
    x: row.x,
    y: row.y,
    size,
    rotation: row.rotation ?? 0,
    name: row.combatants?.name ?? '',
    color,
    imageStoragePath: imagePath,
    characterId,
    npcId,
    creatureId,
    visibleToAll: row.visible_to_all ?? true,
    // v2.312: new field. Always populated when this path is used.
    combatantId: row.combatant_id,
  };
}

/** List all placements for a scene, JOINed with their combatants.
 *  RLS filters per user (DM sees all; players see visible_to_all
 *  placements on published scenes — the v2.309 policies enforce this). */
export async function listPlacements(sceneId: string): Promise<Token[]> {
  const { data, error } = await db
    .from('scene_token_placements')
    .select(
      'id, scene_id, combatant_id, x, y, rotation, z_index, ' +
        'size_override, color_override, image_storage_path_override, ' +
        'visible_to_all, ' +
        'combatants:combatant_id ( id, name, portrait_storage_path, ' +
        'definition_type, definition_id )'
    )
    .eq('scene_id', sceneId)
    .order('z_index', { ascending: true });
  if (error) {
    console.error('[scenePlacements] listPlacements failed', error);
    return [];
  }
  // The PostgREST FK join returns the joined row as an object (since
  // combatant_id is a foreign key with cardinality 1). Cast through
  // unknown to satisfy TS without overspecifying the supabase-js type.
  return (data ?? []).map((r: PlacementJoinRow) => joinedRowToToken(r));
}

/** Create a placement, optionally creating a backing combatant if the
 *  caller doesn't have one yet.
 *
 *  combatantId resolution order:
 *    1. opts.combatantId (caller-provided, e.g. when placing an
 *       existing roster combatant)
 *    2. token.combatantId (set by an upstream picker)
 *    3. Create a new combatant of the inferred type:
 *       - characterId set → 'character' type, definition_id = characterId
 *       - npcId set       → 'narrative_npc' type, definition_id = npcId
 *       - otherwise       → 'custom' type, definition_id = null
 *       In this branch, opts.campaignId MUST be provided so the new
 *       combatant has the right campaign scope.
 *
 *  Returns the created placement's id on success, or null on failure.
 *  The id is needed by the caller to refer back to the placement for
 *  subsequent updates. */
export async function createPlacement(
  token: Token,
  opts?: { combatantId?: string; campaignId?: string }
): Promise<string | null> {
  if (!token.sceneId) {
    console.error('[scenePlacements] createPlacement: token.sceneId is null');
    return null;
  }

  let combatantId = opts?.combatantId ?? token.combatantId ?? null;

  if (!combatantId) {
    if (!opts?.campaignId) {
      console.error(
        '[scenePlacements] createPlacement: campaignId is required when ' +
          'no combatantId is provided (need to create a new combatant)'
      );
      return null;
    }
    const { data: userData } = await supabase.auth.getUser();
    const ownerId = userData.user?.id;
    if (!ownerId) {
      console.error('[scenePlacements] createPlacement: no auth user');
      return null;
    }
    const definitionType =
      token.characterId !== null
        ? 'character'
        : token.npcId !== null
          ? 'narrative_npc'
          : 'custom';
    const definitionId = token.characterId ?? token.npcId ?? null;

    const { data: cb, error: cbErr } = await db
      .from('combatants')
      .insert({
        campaign_id: opts.campaignId,
        owner_id: ownerId,
        name: token.name,
        portrait_storage_path: token.imageStoragePath,
        definition_type: definitionType,
        definition_id: definitionId,
      })
      .select('id')
      .single();
    if (cbErr || !cb) {
      console.error('[scenePlacements] createPlacement: combatant insert failed', cbErr);
      return null;
    }
    combatantId = cb.id;
  }

  // Use the token's id as the placement's id so optimistic UI updates
  // can reference the same id before the round trip completes.
  const { data: pl, error } = await db
    .from('scene_token_placements')
    .insert({
      id: token.id,
      scene_id: token.sceneId,
      combatant_id: combatantId,
      x: token.x,
      y: token.y,
      rotation: token.rotation,
      size_override: token.size,
      color_override: token.color,
      image_storage_path_override: token.imageStoragePath,
      visible_to_all: token.visibleToAll,
    })
    .select('id')
    .single();
  if (error || !pl) {
    console.error('[scenePlacements] createPlacement: placement insert failed', error);
    return null;
  }
  return pl.id;
}

/** Position update — drag-end commit. Mirrors sceneTokens.updateTokenPos.
 *
 *  The wall-collision trigger on scene_token_placements (v2.312, reuses
 *  the same check_token_movement_against_walls function used by
 *  scene_tokens) raises ERRCODE 23514 'check_violation' when a player
 *  attempts to move through a wall. The DM bypass in the function
 *  body still applies (scene owners aren't blocked).
 *
 *  We don't introspect the message text — Postgres error codes are
 *  the stable contract. */
export type UpdatePlacementPosResult =
  | { ok: true }
  | { ok: false; reason: 'wall_blocked' | 'other'; message?: string };

export async function updatePlacementPos(
  id: string,
  x: number,
  y: number
): Promise<UpdatePlacementPosResult> {
  // updated_at is bumped by the BEFORE UPDATE trigger (v2.312); we
  // don't need to set it client-side.
  const { error } = await db
    .from('scene_token_placements')
    .update({ x, y })
    .eq('id', id);
  if (error) {
    console.error('[scenePlacements] updatePlacementPos failed', error);
    if (error.code === '23514') {
      return { ok: false, reason: 'wall_blocked', message: error.message };
    }
    return { ok: false, reason: 'other', message: error.message };
  }
  return { ok: true };
}

/** Patch placement and/or combatant fields based on what's in the patch.
 *  Routing rules:
 *    - name              → combatants.name (renames the identity)
 *    - size              → placements.size_override
 *    - color             → placements.color_override
 *    - rotation          → placements.rotation
 *    - imageStoragePath  → placements.image_storage_path_override
 *    - visibleToAll      → placements.visible_to_all
 *
 *  When the patch touches both placement and combatant fields, both
 *  updates run; failure of either logs and returns false. */
export async function updatePlacement(
  id: string,
  patch: Partial<
    Pick<Token, 'name' | 'size' | 'color' | 'rotation' | 'imageStoragePath' | 'visibleToAll'>
  >
): Promise<boolean> {
  const placementPatch: Record<string, unknown> = {};
  if (patch.size !== undefined) placementPatch.size_override = patch.size;
  if (patch.color !== undefined) placementPatch.color_override = patch.color;
  if (patch.rotation !== undefined) placementPatch.rotation = patch.rotation;
  if (patch.imageStoragePath !== undefined) {
    placementPatch.image_storage_path_override = patch.imageStoragePath;
  }
  if (patch.visibleToAll !== undefined) placementPatch.visible_to_all = patch.visibleToAll;

  if (Object.keys(placementPatch).length > 0) {
    const { error } = await db
      .from('scene_token_placements')
      .update(placementPatch)
      .eq('id', id);
    if (error) {
      console.error('[scenePlacements] updatePlacement: placement update failed', error);
      return false;
    }
  }

  // Renames flow to the combatant — that's the identity layer.
  if (patch.name !== undefined) {
    const { data: pl, error: lookupErr } = await db
      .from('scene_token_placements')
      .select('combatant_id')
      .eq('id', id)
      .maybeSingle();
    if (lookupErr) {
      console.error('[scenePlacements] updatePlacement: combatant_id lookup failed', lookupErr);
      return false;
    }
    if (pl?.combatant_id) {
      const { error } = await db
        .from('combatants')
        .update({ name: patch.name })
        .eq('id', pl.combatant_id);
      if (error) {
        console.error('[scenePlacements] updatePlacement: combatant rename failed', error);
        return false;
      }
    }
  }

  return true;
}

/** Delete a placement. Does NOT delete the combatant — combatants
 *  persist beyond a single placement (they may be on other scenes or
 *  in combat encounters). RLS ensures only the scene owner can delete. */
export async function deletePlacement(id: string): Promise<boolean> {
  const { error } = await db.from('scene_token_placements').delete().eq('id', id);
  if (error) {
    console.error('[scenePlacements] deletePlacement failed', error);
    return false;
  }
  return true;
}

/** Read the campaign's use_combatants_for_battlemap feature flag.
 *  v2.313 calls this to decide which API path to take. Returns false
 *  (legacy path) on any read error so a transient outage doesn't
 *  silently switch render modes. */
export async function getUseCombatantsFlag(campaignId: string): Promise<boolean> {
  const { data, error } = await db
    .from('campaigns')
    .select('use_combatants_for_battlemap')
    .eq('id', campaignId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[scenePlacements] getUseCombatantsFlag failed', error);
    return false;
  }
  return data.use_combatants_for_battlemap === true;
}
