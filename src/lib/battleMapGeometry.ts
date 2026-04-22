// v2.128.0 — Phase K pt 1 of the Combat Backbone
//
// Battle-map geometry helpers: resolve participant → token, compute
// Chebyshev distance in feet between tokens/participants, and load the
// active map for a campaign. Consolidates token-lookup patterns that were
// scattered across Phase G (OA offers) into a single library.
//
// Design notes:
// - Tokens live in battle_maps.tokens (jsonb), typically shaped
//   `{row, col, name, character_id?, size?, ...}`. We match by character_id
//   for player tokens and case-insensitive name for monster/NPC tokens (the
//   same pattern Phase G established).
// - Grid cell size defaults to 5 ft (D&D standard). battle_maps.grid_size
//   is the px-per-cell for rendering; the feet-per-cell constant is
//   conceptually different and always 5 ft per RAW.
// - All distance queries FAIL OPEN when tokens are missing — callers that
//   gate reactions on distance should treat `null` as "allow" so the
//   reaction still fires when the DM hasn't placed tokens for the
//   encounter. Phase K polish can add a per-encounter toggle to fail
//   closed instead.

import { supabase } from './supabase';

const FEET_PER_SQUARE = 5;   // D&D RAW, not battle_maps.grid_size (which is px)

/**
 * A token on the battle map. Only the positional fields are guaranteed;
 * other properties (name, character_id, etc.) are used for lookup.
 */
export interface BattleMapToken {
  row: number;
  col: number;
  name?: string;
  character_id?: string;
  participant_id?: string;
  size?: number;
  [k: string]: unknown;
}

/** Minimal participant shape needed for token lookup. */
export interface ParticipantForTokenLookup {
  id: string;
  name: string;
  participant_type: 'character' | 'monster' | 'npc';
  entity_id?: string | null;
}

export interface ActiveBattleMap {
  id: string;
  tokens: BattleMapToken[];
  grid_cols: number;
  grid_rows: number;
  grid_size: number;   // px per cell (rendering)
}

/**
 * Load the active battle map for a campaign. Returns null if no active map
 * exists (common in text-only / theater-of-the-mind encounters).
 */
export async function loadActiveBattleMap(
  campaignId: string,
): Promise<ActiveBattleMap | null> {
  const { data } = await supabase
    .from('battle_maps')
    .select('id, tokens, grid_cols, grid_rows, grid_size')
    .eq('campaign_id', campaignId)
    .eq('active', true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    tokens: ((data.tokens ?? []) as BattleMapToken[]),
    grid_cols: (data.grid_cols as number) ?? 0,
    grid_rows: (data.grid_rows as number) ?? 0,
    grid_size: (data.grid_size as number) ?? 50,
  };
}

/**
 * Find the battle-map token for a participant. Characters match by
 * `entity_id` (character_id), monsters/NPCs by case-insensitive name.
 * Tokens without row/col are ignored.
 */
export function findTokenForParticipant(
  participant: ParticipantForTokenLookup,
  tokens: BattleMapToken[],
): BattleMapToken | null {
  for (const t of tokens) {
    if (!t || typeof t.row !== 'number' || typeof t.col !== 'number') continue;
    if (participant.participant_type === 'character') {
      if (t.character_id && participant.entity_id && t.character_id === participant.entity_id) return t;
    } else {
      if ((t.name ?? '').toLowerCase() === participant.name.toLowerCase()) return t;
    }
  }
  return null;
}

/**
 * Chebyshev distance between two tokens in feet. RAW 2024: diagonals
 * count as a single square (not 1.5 like older optional rules).
 */
export function distanceBetweenTokensFt(
  a: BattleMapToken,
  b: BattleMapToken,
  feetPerSquare: number = FEET_PER_SQUARE,
): number {
  const cells = Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  return cells * feetPerSquare;
}

/**
 * Convenience: load the active map + look up both tokens + compute
 * distance. Returns null if either token is missing (caller decides what
 * to do — usually "fail open" = treat null as allow).
 */
export async function distanceBetweenParticipantsFt(
  campaignId: string,
  partA: ParticipantForTokenLookup,
  partB: ParticipantForTokenLookup,
): Promise<number | null> {
  const map = await loadActiveBattleMap(campaignId);
  if (!map) return null;
  return distanceBetweenParticipantsFtUsingMap(partA, partB, map);
}

/**
 * Same as above but re-uses a pre-loaded map — callers that already loaded
 * the map should pass it in to avoid N queries when gating many reactors.
 */
export function distanceBetweenParticipantsFtUsingMap(
  partA: ParticipantForTokenLookup,
  partB: ParticipantForTokenLookup,
  map: ActiveBattleMap,
): number | null {
  const tokenA = findTokenForParticipant(partA, map.tokens);
  const tokenB = findTokenForParticipant(partB, map.tokens);
  if (!tokenA || !tokenB) return null;
  return distanceBetweenTokensFt(tokenA, tokenB);
}

/**
 * Range gate: returns true iff the two participants are within `maxFt` on
 * the active battle map. Returns `true` (fail open) when the map or
 * tokens are missing — see module docstring for rationale.
 */
export async function isWithinRangeFt(
  campaignId: string,
  partA: ParticipantForTokenLookup,
  partB: ParticipantForTokenLookup,
  maxFt: number,
): Promise<boolean> {
  const d = await distanceBetweenParticipantsFt(campaignId, partA, partB);
  if (d === null) return true;   // fail open
  return d <= maxFt;
}

// v2.129.0 — Phase K pt 2: AoE / radius helpers.
//
// Two related helpers used by DeclareAttackModal (player AoE auto-select)
// and the attack pipeline (future friendly-fire checks, spell-radius target
// derivation). Both operate on a pre-built positions Map to avoid re-scanning
// the tokens array for each query.

export interface ParticipantPosition {
  row: number;
  col: number;
}

/**
 * Build a `participantId → {row, col}` map from a list of participants and
 * the active map's tokens. Participants without a matching token are simply
 * absent from the map — callers treat "no position" as "not on the grid" and
 * typically skip them in distance queries.
 */
export function buildParticipantPositions(
  participants: ParticipantForTokenLookup[],
  tokens: BattleMapToken[],
): Map<string, ParticipantPosition> {
  const map = new Map<string, ParticipantPosition>();
  for (const p of participants) {
    const token = findTokenForParticipant(p, tokens);
    if (token && typeof token.row === 'number' && typeof token.col === 'number') {
      map.set(p.id, { row: token.row, col: token.col });
    }
  }
  return map;
}

export interface RadiusMatch<P> {
  participant: P;
  distanceFt: number;
}

/**
 * Find all participants within `radiusFt` of a center position using
 * Chebyshev (king's-move) distance. Radius is inclusive — a participant
 * exactly at `radiusFt` counts as inside.
 *
 * Callers can exclude specific participant IDs (e.g., the caster themself)
 * via the optional `excludeIds` set. Dead participants are NOT auto-excluded
 * — pass them in `excludeIds` if your spell shouldn't re-target corpses.
 */
export function findParticipantsInRadius<P extends ParticipantForTokenLookup>(
  participants: P[],
  positions: Map<string, ParticipantPosition>,
  center: ParticipantPosition,
  radiusFt: number,
  excludeIds?: ReadonlySet<string> | null,
  feetPerSquare: number = FEET_PER_SQUARE,
): RadiusMatch<P>[] {
  const radiusCells = Math.floor(radiusFt / feetPerSquare);
  const results: RadiusMatch<P>[] = [];
  for (const p of participants) {
    if (excludeIds && excludeIds.has(p.id)) continue;
    const pos = positions.get(p.id);
    if (!pos) continue;
    const cells = Math.max(Math.abs(pos.row - center.row), Math.abs(pos.col - center.col));
    if (cells <= radiusCells) {
      results.push({ participant: p, distanceFt: cells * feetPerSquare });
    }
  }
  return results;
}
