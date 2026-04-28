// v2.223.0 — Phase Q.1 pt 16 (Phase 3 begin): scene_walls API layer.
//
// Walls are line segments. They block sight (v2.224 vision polygon) and
// movement (future). Stored with float endpoints in world pixel coords;
// the wall drawing tool snaps endpoints to cell corners but the schema
// supports free placement for future curve approximations.
//
// Same fire-and-forget pattern as scene_tokens — caller updates the
// store optimistically, this layer returns boolean/null on completion.
// Realtime echo (Postgres Changes from v2.214 channel pattern) syncs
// to all clients including the originator.

import { supabase } from '../supabase';
import type { Wall } from '../stores/battleMapStore';

/** Convert snake_case DB row to camelCase Wall. */
export function dbRowToWall(row: any): Wall {
  return {
    id: row.id,
    sceneId: row.scene_id,
    x1: row.x1,
    y1: row.y1,
    x2: row.x2,
    y2: row.y2,
    blocksSight: row.blocks_sight ?? true,
    blocksMovement: row.blocks_movement ?? true,
    doorState: row.door_state ?? null,
  };
}

/** Convert Wall to DB INSERT payload. */
function wallToInsertRow(wall: Wall) {
  return {
    id: wall.id,
    scene_id: wall.sceneId,
    x1: wall.x1,
    y1: wall.y1,
    x2: wall.x2,
    y2: wall.y2,
    blocks_sight: wall.blocksSight,
    blocks_movement: wall.blocksMovement,
    door_state: wall.doorState,
  };
}

/** List all walls in a scene. RLS filters per user (DM sees all,
 *  party members of published scenes get SELECT only). */
export async function listWalls(sceneId: string): Promise<Wall[]> {
  const { data, error } = await supabase
    .from('scene_walls')
    .select('*')
    .eq('scene_id', sceneId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[sceneWalls] listWalls failed', error);
    return [];
  }
  return (data ?? []).map(dbRowToWall);
}

/** Create a new wall. RLS gates DM-only insert. */
export async function createWall(wall: Wall): Promise<boolean> {
  if (!wall.sceneId) {
    console.error('[sceneWalls] createWall: wall.sceneId is null');
    return false;
  }
  const { error } = await supabase.from('scene_walls').insert(wallToInsertRow(wall));
  if (error) {
    console.error('[sceneWalls] createWall failed', error);
    return false;
  }
  return true;
}

/** Delete a wall. RLS gates DM-only. */
export async function deleteWall(id: string): Promise<boolean> {
  const { error } = await supabase.from('scene_walls').delete().eq('id', id);
  if (error) {
    console.error('[sceneWalls] deleteWall failed', error);
    return false;
  }
  return true;
}

/** v2.358.0 — Bulk-clear all walls for a scene. Companion to
 *  clearSceneDrawings (v2.356). User feedback: walls erased via the
 *  eraser tool sometimes "stayed" — visually gone but still in the
 *  scene_walls table, where the server-side wall-collision trigger
 *  reads them and blocks token movement. Bulk delete from the DB
 *  side is the unambiguous way to wipe them all in one shot.
 *  Returns the count of rows deleted, or -1 on failure. */
export async function clearSceneWalls(sceneId: string): Promise<number> {
  const { data, error } = await supabase
    .from('scene_walls')
    .delete()
    .eq('scene_id', sceneId)
    .select('id');
  if (error) {
    console.error('[sceneWalls] clearSceneWalls failed', error);
    return -1;
  }
  return (data ?? []).length;
}

/** v2.271.0 — Update a wall's mutable fields (currently only
 *  doorState; blocksSight / blocksMovement are reserved for future
 *  ships and aren't surfaced in the UI yet). RLS gates DM-only
 *  UPDATE; party members of published scenes only have SELECT.
 *
 *  Pass only the fields you want to change. Unspecified fields are
 *  left alone via Postgres's default "set unchanged columns to their
 *  current value" UPDATE semantics. */
export async function updateWall(
  id: string,
  patch: Partial<Pick<Wall, 'doorState' | 'blocksSight' | 'blocksMovement'>>,
): Promise<boolean> {
  // Strictly typed row shape — Record<string, unknown> doesn't pass
  // supabase-js's RejectExcessProperties guard. Use a proper interface
  // matching the scene_walls UPDATE column subset. `'locked'` is part
  // of the Wall.doorState union (DB CHECK set) but isn't reachable
  // from the current toggle UI; keep it in the type so future ships
  // adding a "lock door" affordance don't have to widen this.
  const row: {
    door_state?: 'open' | 'closed' | 'locked' | null;
    blocks_sight?: boolean;
    blocks_movement?: boolean;
  } = {};
  if ('doorState' in patch) row.door_state = patch.doorState ?? null;
  if ('blocksSight' in patch) row.blocks_sight = patch.blocksSight;
  if ('blocksMovement' in patch) row.blocks_movement = patch.blocksMovement;
  if (Object.keys(row).length === 0) return true; // no-op
  const { error } = await supabase.from('scene_walls').update(row).eq('id', id);
  if (error) {
    console.error('[sceneWalls] updateWall failed', error);
    return false;
  }
  return true;
}
