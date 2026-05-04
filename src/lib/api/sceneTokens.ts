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
    // v2.354.0: legacy npcId reads are mirrored from creature_id.
    // npc_id column was dropped in v2.350 (always null on read);
    // homebrew_monsters absorbed npcs so the IDs are identical. Old
    // code reading t.npcId continues to work without a refactor.
    npcId: row.creature_id ?? row.npc_id ?? null,
    creatureId: row.creature_id ?? null,
    // v2.282: read visible_to_all. RLS already filters rows the user
    // shouldn't see; this read is for the DM's own list (which sees
    // every row) so the UI can render hidden tokens with a faded
    // visual cue. Default true to match the DB default for any
    // legacy rows that predate the column.
    visibleToAll: row.visible_to_all ?? true,
    // v2.411.0: read is_locked. Column added in migration
    // add_is_locked_to_scene_tokens_v2_411; default false. Cast
    // through any to tolerate stale generated supabase types until
    // the next type-regen pass.
    isLocked: (row as any).is_locked ?? false,
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
    // v2.354.0: write creature_id (new column, v2.350). The legacy
    // npc_id column was dropped — writing to it would 500 the insert.
    // For tokens carrying a legacy npcId in their runtime shape (any
    // realtime payload created before this client deployed), we mirror
    // it into creature_id since homebrew_monsters absorbed npcs and
    // the IDs map 1:1 per the v2.350 migration.
    creature_id: token.creatureId ?? token.npcId ?? null,
    // v2.282: persist visible_to_all so DM-placed tokens that the
    // caller marked hidden actually go to the DB hidden. Without
    // this the DB default (true) would override the caller's intent.
    visible_to_all: token.visibleToAll,
    // v2.411.0: persist is_locked. Cast the row type through any —
    // the generated supabase types will pick up the column after the
    // next regen, but this write is safe today against the live DB.
    ...({ is_locked: token.isLocked } as any),
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

/** Commit a position update — called at drag end after snap.
 *
 *  v2.275.0 — return shape extended from boolean to a discriminated
 *  result so the caller can tell apart the wall-collision rejection
 *  (server trigger, ERRCODE 23514 — recoverable, snap back + toast)
 *  from any other failure (network, RLS, validation — also snap back
 *  but possibly with a different message). The trigger was added in
 *  the v2.275 migration; previously this function only had to deal
 *  with network / RLS failures so a boolean was sufficient.
 *
 *  We don't introspect the message text — Postgres error codes are
 *  the stable contract. 23514 is the standard SQLSTATE for
 *  check_violation, which our trigger raises explicitly via
 *  `USING ERRCODE = 'check_violation'`. */
export type UpdateTokenPosResult =
  | { ok: true }
  | { ok: false; reason: 'wall_blocked' | 'other'; message?: string };

export async function updateTokenPos(id: string, x: number, y: number): Promise<UpdateTokenPosResult> {
  const { error } = await supabase
    .from('scene_tokens')
    .update({ x, y, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('[sceneTokens] updateTokenPos failed', error);
    if (error.code === '23514') {
      return { ok: false, reason: 'wall_blocked', message: error.message };
    }
    return { ok: false, reason: 'other', message: error.message };
  }
  return { ok: true };
}

/** Patch arbitrary fields (rename, resize, recolor, set portrait,
 *  hide-from-players). v2.282 added visibleToAll to the patch shape
 *  so the context-menu Hide/Show toggle can write through this same
 *  path — kept the rest of the API surface identical. */
export async function updateToken(
  id: string,
  patch: Partial<Pick<Token, 'name' | 'size' | 'color' | 'rotation' | 'imageStoragePath' | 'visibleToAll' | 'isLocked'>>
): Promise<boolean> {
  const dbPatch: SceneTokenUpdate = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.size !== undefined) dbPatch.size = patch.size;
  if (patch.color !== undefined) dbPatch.color = patch.color;
  if (patch.rotation !== undefined) dbPatch.rotation = patch.rotation;
  if (patch.imageStoragePath !== undefined) dbPatch.image_storage_path = patch.imageStoragePath;
  if (patch.visibleToAll !== undefined) dbPatch.visible_to_all = patch.visibleToAll;
  // v2.411.0: pass-through for is_locked. Patch through any since the
  // generated supabase types haven't been regenerated to include the
  // new column yet.
  if (patch.isLocked !== undefined) (dbPatch as any).is_locked = patch.isLocked;
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
