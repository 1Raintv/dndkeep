// v2.313.0 — Combat Phase 3 pt 5: tokens API router.
// v2.495.0 — Combat Phase 3.1: kill the module-level singleton cache.
//
// Routes between sceneTokens.ts (legacy) and scenePlacements.ts (new
// combatants + placements path) based on the per-campaign
// use_combatants_for_battlemap flag.
//
// PRE-v2.495 design (deprecated): a module-level boolean
// `useNewPath` was set by BattleMapV2's scene-load effect via
// `setUseCombatantsPath()`. Every router method read the same global.
// This was a footgun because:
//   - NpcTokenQuickPanel and any other component making a router
//     call without BattleMapV2 being the most-recent setter got
//     whatever flag was left over. NpcTokenQuickPanel's hide-from-
//     players toggle in particular would silently write to the
//     wrong table.
//   - NPCManager and startCombatFromMap had to bypass the router
//     entirely with inline `useNewPath = await getUseCombatantsFlag()`
//     branching, duplicating logic the router was supposed to own.
//
// v2.495 design (current): every router method takes an explicit
// `{ campaignId }` in its options bag. The router resolves the flag
// per-campaign and caches the resolution as a Promise<boolean> so
// concurrent calls share a single in-flight lookup (and subsequent
// calls hit the cache).
//
// Callers no longer manage routing state. Cache invalidation is
// exposed via `invalidateFlag(campaignId)` for the rare case when
// the DM toggles the BattleMap Engine setting mid-session — call
// this from CampaignSettings.saveUsePhase3 (v2.314 setting) so the
// next router call sees the new value. Pre-v2.495 a reload was
// required after that toggle; v2.495 still recommends a reload
// (BattleMapV2 maintains its own subscription bindings that don't
// re-wire on toggle), but the API surface is now correct.
//
// Endgame (unchanged): once v2.315 (deferred, real version TBD)
// cuts over by dropping scene_tokens, the legacy branch is removed
// and the router becomes a thin re-export. v2.316 inlines.

import * as legacy from './sceneTokens';
import * as next from './scenePlacements';
import type { Token } from '../stores/battleMapStore';

// ---------------------------------------------------------------
// Per-campaign flag cache.
// ---------------------------------------------------------------
//
// Caches the boolean as a Promise so:
//   (a) repeat lookups for the same campaignId don't re-query, and
//   (b) two near-simultaneous router calls during a scene load
//       share one DB roundtrip instead of racing.
//
// The Map is module-level (one per browser tab). It's safe under
// the multi-campaign-per-tab case the pre-v2.495 design couldn't
// handle: each campaignId has its own entry.
const flagCache: Map<string, Promise<boolean>> = new Map();

/** Resolve the use_combatants_for_battlemap flag for a campaign.
 *  Memoized — first call kicks off a DB read, subsequent calls
 *  return the same promise. Errors are not cached: if the lookup
 *  fails the cache entry is cleared so the next call retries. */
function resolveFlag(campaignId: string): Promise<boolean> {
  const cached = flagCache.get(campaignId);
  if (cached) return cached;
  const inFlight = next.getUseCombatantsFlag(campaignId).catch((err) => {
    // Clear the cache so the next call retries the lookup. Then
    // fall back to legacy — safer than guessing Phase 3 when we
    // genuinely don't know.
    flagCache.delete(campaignId);
    console.warn('[tokensApiRouter] flag lookup failed for', campaignId, err);
    return false;
  });
  flagCache.set(campaignId, inFlight);
  return inFlight;
}

/** Invalidate the cached flag for a campaign. Call from
 *  CampaignSettings after the DM toggles use_combatants_for_battlemap
 *  so subsequent router calls pick up the new value without a reload.
 *  (BattleMapV2's own scene/realtime bindings still need a reload to
 *  re-wire; this just keeps the router honest in the meantime.) */
export function invalidateFlag(campaignId: string): void {
  flagCache.delete(campaignId);
}

/** Test-only: drop all cache entries. Not part of the supported API. */
export function _clearFlagCacheForTests(): void {
  flagCache.clear();
}

// ---------------------------------------------------------------
// Routed methods.
// ---------------------------------------------------------------

export async function listTokens(
  sceneId: string,
  opts: { campaignId: string },
): Promise<Token[]> {
  const useNewPath = await resolveFlag(opts.campaignId);
  return useNewPath ? next.listPlacements(sceneId) : legacy.listTokens(sceneId);
}

/** createToken normalizes the two underlying signatures:
 *    legacy.createToken(token) → boolean
 *    next.createPlacement(token, opts) → string | null
 *  Returns boolean either way so existing call sites work unchanged.
 *  `campaignId` is required (used to resolve the flag AND, on the
 *  new path, to create the combatant when token.combatantId is
 *  unset). */
export async function createToken(
  token: Token,
  opts: { campaignId: string; combatantId?: string },
): Promise<boolean> {
  const useNewPath = await resolveFlag(opts.campaignId);
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
  y: number,
  opts: { campaignId: string },
): Promise<UpdateTokenPosResult> {
  const useNewPath = await resolveFlag(opts.campaignId);
  return useNewPath
    ? next.updatePlacementPos(id, x, y)
    : legacy.updateTokenPos(id, x, y);
}

export async function updateToken(
  id: string,
  patch: Partial<
    Pick<Token, 'name' | 'size' | 'color' | 'rotation' | 'imageStoragePath' | 'visibleToAll'>
  >,
  opts: { campaignId: string },
): Promise<boolean> {
  const useNewPath = await resolveFlag(opts.campaignId);
  return useNewPath
    ? next.updatePlacement(id, patch)
    : legacy.updateToken(id, patch);
}

export async function deleteToken(
  id: string,
  opts: { campaignId: string },
): Promise<boolean> {
  const useNewPath = await resolveFlag(opts.campaignId);
  return useNewPath ? next.deletePlacement(id) : legacy.deleteToken(id);
}
