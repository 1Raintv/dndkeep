// v2.234.0 — Phase Q.1 pt 23: scene_texts API layer.
//
// Map text annotations: a string of text anchored at a world (x, y) in
// the scene's coordinate space (same units as scene_walls — pixel
// coords, NOT cell indices). Used for room labels, GM notes, marker
// callouts, etc. Same fire-and-forget pattern as scene_walls and
// scene_tokens; the caller updates the store optimistically, this
// layer returns the payload on completion (or null on failure).
// Realtime echo from postgres_changes syncs to all clients.

import { supabase } from '../supabase';
import type { SceneText } from '../stores/battleMapStore';

/** Convert snake_case DB row to camelCase SceneText. */
export function dbRowToSceneText(row: any): SceneText {
  return {
    id: row.id,
    sceneId: row.scene_id,
    x: row.x,
    y: row.y,
    text: row.text ?? '',
    color: row.color ?? '#ffffff',
    fontSize: row.font_size ?? 16,
  };
}

/** Convert a SceneText to DB INSERT payload (snake_case). */
function sceneTextToInsertRow(t: SceneText) {
  return {
    id: t.id,
    scene_id: t.sceneId,
    x: t.x,
    y: t.y,
    text: t.text,
    color: t.color,
    font_size: t.fontSize,
  };
}

/** List all texts in a scene. RLS filters per user (DM sees all;
 *  party members of published scenes get SELECT only). */
export async function listTexts(sceneId: string): Promise<SceneText[]> {
  const { data, error } = await supabase
    .from('scene_texts')
    .select('*')
    .eq('scene_id', sceneId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[sceneTexts] listTexts failed', error);
    return [];
  }
  return (data ?? []).map(dbRowToSceneText);
}

/** Insert a new text annotation. DM-only by RLS. Returns the inserted
 *  row (with server-generated id if the caller didn't supply one)
 *  or null on failure. */
export async function createText(t: SceneText): Promise<SceneText | null> {
  const { data, error } = await supabase
    .from('scene_texts')
    .insert(sceneTextToInsertRow(t))
    .select()
    .single();
  if (error || !data) {
    console.error('[sceneTexts] createText failed', error);
    return null;
  }
  return dbRowToSceneText(data);
}

/** Patch an existing text. DM-only by RLS. */
export async function updateText(
  id: string,
  patch: Partial<Pick<SceneText, 'x' | 'y' | 'text' | 'color' | 'fontSize'>>,
): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.x !== undefined) row.x = patch.x;
  if (patch.y !== undefined) row.y = patch.y;
  if (patch.text !== undefined) row.text = patch.text;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.fontSize !== undefined) row.font_size = patch.fontSize;
  row.updated_at = new Date().toISOString();
  const { error } = await supabase
    .from('scene_texts')
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[sceneTexts] updateText failed', error);
    return false;
  }
  return true;
}

/** Delete a text by id. DM-only by RLS. */
export async function deleteText(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('scene_texts')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[sceneTexts] deleteText failed', error);
    return false;
  }
  return true;
}
