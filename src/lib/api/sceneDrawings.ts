// v2.235.0 — Phase Q.1 pt 24: scene_drawings API layer.
//
// Drawings are freehand pencil, line, rect, or circle annotations on
// the map. Stored with a flat [[x, y], ...] points array in world
// pixel coords. Schema interpretation per kind:
//   - pencil: arbitrary-length polyline (the user's drag samples)
//   - line:   exactly 2 points (start, end)
//   - rect:   exactly 2 points (top-left, bottom-right)
//   - circle: exactly 2 points (center, an edge point — radius
//             computed at render time as Euclidean distance)
//
// Drawings are immutable in this ship — DM creates or deletes; no
// update path. The data shape supports adding update later if useful
// (e.g. recolor, recoordinate) without a schema migration.
//
// Same fire-and-forget pattern as scene_walls / scene_texts. Realtime
// echo from postgres_changes syncs to all clients.

import { supabase } from '../supabase';
import type { SceneDrawing, DrawingKind } from '../stores/battleMapStore';

export function dbRowToSceneDrawing(row: any): SceneDrawing {
  const raw = Array.isArray(row.points) ? row.points : [];
  // Coerce each point to {x, y}; the DB stores [x, y] tuples but we
  // tolerate both formats in case anything else writes objects.
  const points = raw.map((p: any) => {
    if (Array.isArray(p) && p.length >= 2) {
      return { x: Number(p[0]), y: Number(p[1]) };
    }
    if (p && typeof p === 'object') {
      return { x: Number(p.x), y: Number(p.y) };
    }
    return { x: 0, y: 0 };
  });
  return {
    id: row.id,
    sceneId: row.scene_id,
    kind: row.kind as DrawingKind,
    points,
    color: row.color ?? '#a78bfa',
    lineWidth: row.line_width ?? 3,
  };
}

function sceneDrawingToInsertRow(d: SceneDrawing) {
  return {
    id: d.id,
    scene_id: d.sceneId,
    kind: d.kind,
    points: d.points.map(p => [p.x, p.y]),
    color: d.color,
    line_width: d.lineWidth,
  };
}

export async function listDrawings(sceneId: string): Promise<SceneDrawing[]> {
  const { data, error } = await supabase
    .from('scene_drawings')
    .select('*')
    .eq('scene_id', sceneId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[sceneDrawings] listDrawings failed', error);
    return [];
  }
  return (data ?? []).map(dbRowToSceneDrawing);
}

export async function createDrawing(d: SceneDrawing): Promise<SceneDrawing | null> {
  const { data, error } = await supabase
    .from('scene_drawings')
    .insert(sceneDrawingToInsertRow(d))
    .select()
    .single();
  if (error || !data) {
    console.error('[sceneDrawings] createDrawing failed', error);
    return null;
  }
  return dbRowToSceneDrawing(data);
}

/** v2.356.0 — Bulk-clear all drawings for a scene. Used by the
 *  battle map's "Clear Drawings" toolbar button so the DM can wipe
 *  pencil annotations / lines / shapes in one shot rather than
 *  selecting and deleting them one at a time. Walls are deliberately
 *  separate (different concept — structural geometry, not
 *  annotations); same with texts. Returns the count of rows deleted
 *  for status reporting; -1 on failure. */
export async function clearSceneDrawings(sceneId: string): Promise<number> {
  // Two-step so we can return the count. We could also use
  // `.delete().eq().select()` to avoid the round-trip, but Supabase's
  // `select()` after `delete()` returns the deleted rows which is
  // useful for the count without an extra query. Single-step:
  const { data, error } = await supabase
    .from('scene_drawings')
    .delete()
    .eq('scene_id', sceneId)
    .select('id');
  if (error) {
    console.error('[sceneDrawings] clearSceneDrawings failed', error);
    return -1;
  }
  return (data ?? []).length;
}

export async function deleteDrawing(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('scene_drawings')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[sceneDrawings] deleteDrawing failed', error);
    return false;
  }
  return true;
}

/** v2.255.0 — patch an existing drawing. Used by drag-to-reposition
 *  (rewrites the points array with translated coords) and would
 *  support recolor/recoordinate later. Same fire-and-forget contract
 *  as the rest of this module: callers update the local store first,
 *  then call this; failures log but don't roll back. */
export async function updateDrawing(
  id: string,
  patch: Partial<Pick<SceneDrawing, 'points' | 'color' | 'lineWidth'>>,
): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.points !== undefined) row.points = patch.points.map(p => [p.x, p.y]);
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.lineWidth !== undefined) row.line_width = patch.lineWidth;
  const { error } = await supabase
    .from('scene_drawings')
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[sceneDrawings] updateDrawing failed', error);
    return false;
  }
  return true;
}
