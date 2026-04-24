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
