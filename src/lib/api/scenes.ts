// v2.213.0 — Phase Q.1 pt 6: scenes API layer.
//
// Thin wrappers around Supabase queries for the `scenes` table. Kept
// in a dedicated module so BattleMapV2 stays render-focused and the
// DB access surface is searchable from one file.
//
// RLS (set up in the v2.208 migration) gates who sees/mutates what:
//   - DM sees all their own scenes
//   - Party members see is_published=true scenes in their campaign
//   - Only DM (campaign owner_id = auth.uid()) can insert/update/delete
//
// Error handling is intentionally minimal for v2.213 — this ship
// treats API writes as fire-and-forget with console.error fallbacks.
// v2.215+ will add toast UX + retry on network failures.

import { supabase } from '../supabase';

export interface Scene {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  gridType: 'square' | 'hex_pointy' | 'hex_flat' | 'none';
  gridSizePx: number;
  widthCells: number;
  heightCells: number;
  backgroundStoragePath: string | null;
  dmNotes: string | null;
  isPublished: boolean;
  // v2.274.0 — scene ambient lighting. 'bright' = no fog rendered (day,
  // outdoor); 'dim' = translucent fog (~0.55 alpha — dusk, mood); 'dark'
  // = opaque fog (the v2.224+ default — dungeons, night). DM-controlled
  // via the in-app toolbar; backed by a CHECK-constrained text column.
  ambientLight: 'bright' | 'dim' | 'dark';
  createdAt: string;
  updatedAt: string;
}

/** Convert a snake_case DB row into the camelCase Scene shape. */
function rowToScene(row: any): Scene {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerId: row.owner_id,
    name: row.name,
    gridType: row.grid_type,
    gridSizePx: row.grid_size_px,
    widthCells: row.width_cells,
    heightCells: row.height_cells,
    backgroundStoragePath: row.background_storage_path,
    dmNotes: row.dm_notes,
    isPublished: row.is_published,
    // v2.274.0 — fall back to 'dark' if the column is somehow missing
    // (shouldn't happen post-migration, but defensive against stale
    // server response shapes during the migration rollout window).
    ambientLight: row.ambient_light ?? 'dark',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** List all scenes visible to the current user in a campaign. RLS
 *  filters out scenes the user can't see (non-DM + not-is_published). */
export async function listScenes(campaignId: string): Promise<Scene[]> {
  const { data, error } = await supabase
    .from('scenes')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[scenes] listScenes failed', error);
    return [];
  }
  return (data ?? []).map(rowToScene);
}

/** Create a new empty scene with sensible defaults. Ownership + RLS
 *  require the caller to be the campaign's DM. */
export async function createScene(
  campaignId: string,
  ownerId: string,
  overrides?: Partial<Pick<Scene, 'name' | 'gridSizePx' | 'widthCells' | 'heightCells'>>
): Promise<Scene | null> {
  const payload = {
    campaign_id: campaignId,
    owner_id: ownerId,
    name: overrides?.name ?? 'New Scene',
    grid_type: 'square' as const,
    grid_size_px: overrides?.gridSizePx ?? 70,
    width_cells: overrides?.widthCells ?? 30,
    height_cells: overrides?.heightCells ?? 20,
    is_published: true, // default to published so players can see it
  };
  const { data, error } = await supabase
    .from('scenes')
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error('[scenes] createScene failed', error);
    return null;
  }
  return rowToScene(data);
}

/** Delete a scene. Cascades to its scene_tokens via ON DELETE CASCADE. */
export async function deleteScene(sceneId: string): Promise<boolean> {
  const { error } = await supabase.from('scenes').delete().eq('id', sceneId);
  if (error) {
    console.error('[scenes] deleteScene failed', error);
    return false;
  }
  return true;
}

/** Update mutable scene fields (name, grid settings, background, published state, ambient light). */
export async function updateScene(
  sceneId: string,
  patch: Partial<Pick<Scene, 'name' | 'isPublished' | 'dmNotes' | 'gridSizePx' | 'widthCells' | 'heightCells' | 'backgroundStoragePath' | 'ambientLight'>>
): Promise<boolean> {
  const dbPatch: Record<string, any> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.isPublished !== undefined) dbPatch.is_published = patch.isPublished;
  if (patch.dmNotes !== undefined) dbPatch.dm_notes = patch.dmNotes;
  if (patch.gridSizePx !== undefined) dbPatch.grid_size_px = patch.gridSizePx;
  if (patch.widthCells !== undefined) dbPatch.width_cells = patch.widthCells;
  if (patch.heightCells !== undefined) dbPatch.height_cells = patch.heightCells;
  // v2.217: allow explicit null (remove background); undefined means "leave alone".
  if (patch.backgroundStoragePath !== undefined) dbPatch.background_storage_path = patch.backgroundStoragePath;
  // v2.274.0 — ambient lighting toggle.
  if (patch.ambientLight !== undefined) dbPatch.ambient_light = patch.ambientLight;
  dbPatch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('scenes').update(dbPatch).eq('id', sceneId);
  if (error) {
    console.error('[scenes] updateScene failed', error);
    return false;
  }
  return true;
}
