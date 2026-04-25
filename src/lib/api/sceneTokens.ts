// v2.213.0 — Phase Q.1 pt 6: scene_tokens API layer.
//
// Thin wrappers around Supabase queries for the `scene_tokens` table.
// The Zustand Token shape mirrors the DB schema closely; the mappers
// here translate snake_case ↔ camelCase and handle the nullable
// columns (character_id, player_id, image_storage_path, sceneId).
//
// v2.213 color column was added via migration in this same ship. If
// you see NULL color in the wild from rows created before the
// migration, rows default to the app purple (0xA78BFA = 10971642).
//
// Commit strategy: mutations here are called by BattleMapV2 after
// the optimistic Zustand store update. API failures log to console
// but do not rollback the store — we accept local-DB drift for v2.213
// and v2.215 adds proper reconciliation on realtime channel events.

import { supabase } from '../supabase';
import type { TableInsert, TableUpdate } from '../../types/supabase';
import type { Token, TokenSize } from '../stores/battleMapStore';

type SceneTokenInsert = TableInsert<'scene_tokens'>;
type SceneTokenUpdate = TableUpdate<'scene_tokens'>;

/** Convert a snake_case DB row to the Zustand Token shape. */
export function dbRowToToken(row: any): Token {
  return {
    id: row.id,
    sceneId: row.scene_id,
    x: row.x,
    y: row.y,
    size: row.size as TokenSize,
    rotation: row.rotation ?? 0,
    name: row.name ?? '',
    color: row.color ?? 0xa78bfa,
    imageStoragePath: row.image_storage_path ?? null,
    characterId: row.character_id ?? null,
    npcId: row.npc_id ?? null,
  };
}

/** Convert a Zustand Token to a DB INSERT payload. The caller is
 *  responsible for ensuring `token.sceneId` is non-null before calling
 *  this — the createToken wrapper guards for that case. */
function tokenToInsertRow(token: Token): SceneTokenInsert {
  return {
    id: token.id,
    scene_id: token.sceneId as string,
    x: token.x,
    y: token.y,
    size: token.size,
    rotation: token.rotation,
    name: token.name,
    color: token.color,
    image_storage_path: token.imageStoragePath,
    character_id: token.characterId,
    npc_id: token.npcId,
  };
}

/** List all tokens in a scene. RLS filters per user (DM sees all,
 *  players see public + their own; the v2.208 policies enforce this). */
export async function listTokens(sceneId: string): Promise<Token[]> {
  const { data, error } = await supabase
    .from('scene_tokens')
    .select('*')
    .eq('scene_id', sceneId)
    .order('z_index', { ascending: true });
  if (error) {
    console.error('[sceneTokens] listTokens failed', error);
    return [];
  }
  return (data ?? []).map(dbRowToToken);
}

/** Insert a new token. sceneId must be set on the token or RLS will
 *  reject (scene_id references a scene we must own to insert). */
export async function createToken(token: Token): Promise<boolean> {
  if (!token.sceneId) {
    console.error('[sceneTokens] createToken: token.sceneId is null');
    return false;
  }
  const { error } = await supabase.from('scene_tokens').insert(tokenToInsertRow(token));
  if (error) {
    console.error('[sceneTokens] createToken failed', error);
    return false;
  }
  return true;
}

/** Commit a position update — called at drag end after snap. */
export async function updateTokenPos(id: string, x: number, y: number): Promise<boolean> {
  const { error } = await supabase
    .from('scene_tokens')
    .update({ x, y, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('[sceneTokens] updateTokenPos failed', error);
    return false;
  }
  return true;
}

/** Patch arbitrary fields (rename, resize, recolor, set portrait). */
export async function updateToken(
  id: string,
  patch: Partial<Pick<Token, 'name' | 'size' | 'color' | 'rotation' | 'imageStoragePath'>>
): Promise<boolean> {
  const dbPatch: SceneTokenUpdate = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.size !== undefined) dbPatch.size = patch.size;
  if (patch.color !== undefined) dbPatch.color = patch.color;
  if (patch.rotation !== undefined) dbPatch.rotation = patch.rotation;
  if (patch.imageStoragePath !== undefined) dbPatch.image_storage_path = patch.imageStoragePath;
  dbPatch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('scene_tokens').update(dbPatch).eq('id', id);
  if (error) {
    console.error('[sceneTokens] updateToken failed', error);
    return false;
  }
  return true;
}

/** Delete a token. RLS ensures only DMs can delete. */
export async function deleteToken(id: string): Promise<boolean> {
  const { error } = await supabase.from('scene_tokens').delete().eq('id', id);
  if (error) {
    console.error('[sceneTokens] deleteToken failed', error);
    return false;
  }
  return true;
}
