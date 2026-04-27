// v2.313.0 — Combat Phase 3 pt 5: tokens API router.
//
// Routes between sceneTokens.ts (legacy) and scenePlacements.ts (new
// combatants + placements path) based on a module-level cache that
// BattleMapV2 sets via setUseCombatantsPath() after fetching the
// per-campaign use_combatants_for_battlemap flag.
//
// Module-level cache rationale: BattleMapV2 is realistically a single
// component instance per browser tab. Multiple tabs across different
// campaigns would each set their own value via the scene-load effect
// before any subsequent API call uses the cache, so cross-tab races
// don't actually corrupt state — the most recent setUseCombatantsPath
// wins and the API calls fire under that path. For the dogfooding
// audience (one DM at a time), this is correct.
//
// The router preserves the sceneTokens.ts return shapes so call sites
// that already exist in BattleMapV2 don't need signature changes —
// except `createToken`, which now accepts an optional opts.campaignId
// to support the new path's combatant creation. Legacy path ignores
// opts; new path requires campaignId when no combatant_id is set on
// the Token.
//
// Once v2.315 cuts over (drops scene_tokens), the legacy branch is
// removed and the router becomes a thin re-export. v2.316 inlines.

import * as legacy from './sceneTokens';
import * as next from './scenePlacements';
import type { Token } from '../stores/battleMapStore';

let useNewPath = false;

/** Configure the active path. Call from BattleMapV2's scene-load
 *  effect after fetching the campaign's use_combatants_for_battlemap
 *  flag. Synchronous so the next API call sees the right value. */
export function setUseCombatantsPath(value: boolean): void {
  useNewPath = value;
}

/** Read the cached flag value. Useful for components that need to
 *  branch their own UI (e.g., realtime subscription wiring). */
export function getUseCombatantsPath(): boolean {
  return useNewPath;
}

export async function listTokens(sceneId: string): Promise<Token[]> {
  return useNewPath ? next.listPlacements(sceneId) : legacy.listTokens(sceneId);
}

/** createToken normalizes the two underlying signatures:
 *    legacy.createToken(token) → boolean
 *    next.createPlacement(token, opts) → string | null
 *  Returns boolean either way so existing call sites work unchanged.
 *  When using the new path, opts.campaignId is REQUIRED unless
 *  token.combatantId is already set. The router can't infer the
 *  campaign from the token (Token doesn't carry campaignId). */
export async function createToken(
  token: Token,
  opts?: { combatantId?: string; campaignId?: string }
): Promise<boolean> {
  if (useNewPath) {
    const id = await next.createPlacement(token, opts);
    return id !== null;
  }
  return legacy.createToken(token);
}

// Re-export the discriminated result type. Both legacy and new path
// produce the same { ok: true } | { ok: false; reason: ...; message? }
// shape, with the same error codes (the wall-collision trigger maps
// to ERRCODE 23514 on both tables).
export type UpdateTokenPosResult = legacy.UpdateTokenPosResult;

export async function updateTokenPos(
  id: string,
  x: number,
  y: number
): Promise<UpdateTokenPosResult> {
  return useNewPath
    ? next.updatePlacementPos(id, x, y)
    : legacy.updateTokenPos(id, x, y);
}

export async function updateToken(
  id: string,
  patch: Partial<
    Pick<Token, 'name' | 'size' | 'color' | 'rotation' | 'imageStoragePath' | 'visibleToAll'>
  >
): Promise<boolean> {
  return useNewPath
    ? next.updatePlacement(id, patch)
    : legacy.updateToken(id, patch);
}

export async function deleteToken(id: string): Promise<boolean> {
  return useNewPath ? next.deletePlacement(id) : legacy.deleteToken(id);
}
