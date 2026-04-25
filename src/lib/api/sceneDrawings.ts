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
