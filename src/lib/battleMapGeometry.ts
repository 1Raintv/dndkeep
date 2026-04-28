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
  /** v2.130.0 — Phase K pt 3: wall segments for line-of-sight. Coordinates
   *  are map-local pixels (same system as tokens + drawings). v2.131+ LoS
   *  queries intersect token-to-token rays against these segments. */
  walls: WallSegment[];
}

/**
 * A wall segment on the battle map. DM-authored via the "wall" drawing tool
 * (v2.130.0). Stored in map-local pixels. LoS calculations (v2.131+) will
 * test segment-segment intersection against these entries. Walls are
 * distinct from `drawings` — decorative marks don't block sight.
 */
export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** v2.145.0 — Phase N pt 3: wall type determines cover contribution.
   *    'wall'   — solid wall; single wall alone = total cover (RAW 2024 p.204)
   *    'low'    — low wall / furniture; single alone = half cover
   *    'window' — arrow slit / portcullis / barred window; single = ¾ cover
   *    'door'   — closed door; single = total cover (treat as solid)
   *    undefined/null — legacy untyped wall; treated as a small obstacle so
   *    existing maps preserve their multi-wall-stacking behavior
   *    (1 wall → half, 2 → ¾, 3+ → total). Migrate legacy walls by editing
   *    them in the drawing tool; no bulk migration forced. */
  type?: 'wall' | 'low' | 'window' | 'door';
}

/**
 * v2.145.0 — Phase N pt 3: cover-point contribution per wall type.
 *
 * Each typed wall contributes the cover-equivalent points for its RAW
 * category. Points are summed across all walls on the line of effect
 * and mapped via {@link pointsToCoverLevel}. Untyped walls keep their
 * legacy single-point behavior (multi-wall stacking to total cover).
 *
 * Rationale: RAW "creatures use the best cover available" — with typed
 * walls, a single solid wall already gives total cover, so the additive
 * model still picks the correct level for clean test cases. Ambiguous
 * cases (e.g. "low wall + window") resolve toward more cover, which is
 * defensible since both obstacles do contribute.
 */
export function wallCoverPoints(w: WallSegment): number {
  switch (w.type) {
    case 'wall':   return 3;   // alone → total
    case 'door':   return 3;   // alone → total (closed)
    case 'window': return 2;   // alone → three_quarters
    case 'low':    return 1;   // alone → half
    default:       return 1;   // legacy: preserves 1=half / 2=¾ / 3+=total
  }
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
    .select('id, tokens, grid_cols, grid_rows, grid_size, walls')
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
    walls: ((data.walls ?? []) as WallSegment[]),
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

// v2.131.0 — Phase K pt 4: line-of-sight math over wall segments.
//
// Pure geometry — no DB access, no async. Given two points on the battle
// map and the wall list, determines whether a straight ray between them
// crosses any walls. Feeds v2.132's auto-cover derivation:
//   0 walls crossed → no cover
//   1 wall crossed  → half cover (standard interpretation of "partial cover")
//   2+ walls        → three-quarters cover
// Walls tagged as "solid" in future schema extensions will upgrade to total
// cover regardless of count.
//
// Coordinate conventions (matches BattleMap.tsx):
//   - Token at {row: N, col: M} occupies the cell whose top-left is at
//     pixel ((M-1)*gridSize, (N-1)*gridSize)
//   - Cell center is at ((M - 0.5) * gridSize, (N - 0.5) * gridSize)

/**
 * Convert a token's grid position to its pixel center. Used by all LoS
 * queries — the ray goes from center to center.
 */
export function tokenCenterPx(
  pos: ParticipantPosition,
  gridSize: number,
): { x: number; y: number } {
  return {
    x: (pos.col - 0.5) * gridSize,
    y: (pos.row - 0.5) * gridSize,
  };
}

/**
 * Classic 2D segment-segment intersection via parametric form. Segments AB
 * and CD intersect iff the solved parameters t and u are both in [0, 1].
 *
 * Returns true for proper intersections AND for T-junction endpoints (a
 * ray that JUST grazes a wall endpoint still counts as crossing). Returns
 * false for collinear-but-non-overlapping cases — walls on the same line
 * as the ray are edge cases the DM can resolve manually.
 */
export function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,   // segment AB
  cx: number, cy: number, dx: number, dy: number,   // segment CD
): boolean {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (denom === 0) return false;   // parallel or collinear — skip edge case
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Count how many walls a straight ray between two pixel points crosses.
 * v2.132 will map counts to cover levels (0=none, 1=half, 2+=three-quarters).
 */
export function countWallsBetweenPx(
  x1: number, y1: number, x2: number, y2: number,
  walls: WallSegment[],
): number {
  let count = 0;
  for (const w of walls) {
    if (segmentsIntersect(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2)) count++;
  }
  return count;
}

/**
 * Convenience: count walls between two grid positions. Converts to pixel
 * centers internally.
 */
export function countWallsBetween(
  from: ParticipantPosition,
  to: ParticipantPosition,
  walls: WallSegment[],
  gridSize: number,
): number {
  const a = tokenCenterPx(from, gridSize);
  const b = tokenCenterPx(to, gridSize);
  return countWallsBetweenPx(a.x, a.y, b.x, b.y, walls);
}

/**
 * True iff the straight ray between two token centers is not blocked by
 * any walls. Returns true when no walls exist (no obstacles = free
 * sight-line) — this is the correct baseline since walls opt-in to
 * blocking LoS.
 */
export function hasLineOfSight(
  from: ParticipantPosition,
  to: ParticipantPosition,
  walls: WallSegment[],
  gridSize: number,
): boolean {
  return countWallsBetween(from, to, walls, gridSize) === 0;
}

/**
 * Derive 2024-PHB cover level from walls crossing the line of effect.
 *
 * RAW 2024 p.204:
 *   - Half cover: +2 AC, +2 Dex save. Examples: low wall, creature.
 *   - Three-quarters cover: +5 AC, +5 Dex save. Examples: portcullis, arrow slit.
 *   - Total cover: can't be targeted directly.
 *
 * Algorithm (v2.145+): sum cover points from all walls crossed using
 * {@link wallCoverPoints}, then bucket:
 *   - 0 pts → 'none'
 *   - 1     → 'half'
 *   - 2     → 'three_quarters'
 *   - 3+    → 'total'
 *
 * Typed walls (new in v2.145) provide RAW-accurate cover in isolation:
 * a single `wall` or `door` gives total, a `window` gives ¾, a `low` gives
 * half. Untyped legacy walls contribute 1 each so existing maps preserve
 * their multi-wall-stacking behavior (1 = half, 2 = ¾, 3+ = total).
 */
export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'total';

/**
 * Map cover points to a cover level. Exposed so callers can reuse the
 * bucketing (e.g. in a "cover score" debug overlay on the map).
 */
export function pointsToCoverLevel(points: number): CoverLevel {
  if (points <= 0) return 'none';
  if (points <= 1) return 'half';
  if (points <= 2) return 'three_quarters';
  return 'total';
}

export function deriveCoverFromWalls(
  from: ParticipantPosition,
  to: ParticipantPosition,
  walls: WallSegment[],
  gridSize: number,
): CoverLevel {
  // Compute crossed walls then sum contributions. We inline the segment
  // intersection here rather than calling countWallsBetween so we can
  // preserve type info without a second pass.
  const a = tokenCenterPx(from, gridSize);
  const b = tokenCenterPx(to, gridSize);
  let points = 0;
  for (const w of walls) {
    if (segmentsIntersect(a.x, a.y, b.x, b.y, w.x1, w.y1, w.x2, w.y2)) {
      points += wallCoverPoints(w);
    }
  }
  return pointsToCoverLevel(points);
}

// ─── v2.343.0 — Shape-aware AoE helpers ──────────────────────────
//
// 5e SRD shapes: sphere, cylinder, cube, cone, line. Each has a
// distinct origin model:
//
//   sphere    — point in the world; participants within radius selected
//   cylinder  — same as sphere in 2D top-down (vertical extrusion not
//               modeled today); aliased to sphere
//   cube      — origin point; cube extends outward along all axes; for
//               grid math, an N-foot cube fills (N/5) × (N/5) cells
//   cone      — apex at caster; opens 53° on each side along a chosen
//               direction; size = length-to-far-edge in feet
//   line      — from caster, length L feet, width 5 ft (1 square)
//
// Inputs match findParticipantsInRadius for sphere; cone/line need the
// caster origin (apex) plus a target direction. Cube needs the origin
// cell. The picker UI provides the "target participant" — we derive
// (caster, target) from that.
//
// The 53.13° cone half-angle is the standard tabletop interpretation
// of "cone fills a triangular area as wide as it is long" (DMG 2014).
// 5e 2024 keeps the same shape geometry. cosθ ≈ 0.6 at 53.13°, so the
// hit test is dot(normalize(toTarget), normalize(toCandidate)) >= 0.6.

const CONE_COSINE_HALF_ANGLE = 0.6;  // cos(53.13°) — wide-as-long cone
const LINE_HALF_WIDTH_FT = 2.5;       // 5ft total width per RAW

export type AoeShape = 'sphere' | 'cylinder' | 'cube' | 'cone' | 'line';

/**
 * Find all participants whose token sits inside an AoE of arbitrary
 * shape. Origin semantics depend on shape:
 *   sphere/cylinder/cube  — origin is the AoE center cell
 *   cone/line             — origin is the CASTER cell (apex / line start)
 *                            and `toward` is required (target cell)
 *
 * Returns the same RadiusMatch[] shape as findParticipantsInRadius so
 * callers can swap implementations without rewriting result-handling.
 * `distanceFt` is Chebyshev distance from origin to the matched token —
 * useful for sorting (closer targets first) and for the call-site to
 * surface "you are 15ft away" labels.
 */
export function findParticipantsInArea<P extends ParticipantForTokenLookup>(
  participants: P[],
  positions: Map<string, ParticipantPosition>,
  shape: AoeShape,
  sizeFt: number,
  origin: ParticipantPosition,
  toward: ParticipantPosition | null,
  excludeIds?: ReadonlySet<string> | null,
  feetPerSquare: number = FEET_PER_SQUARE,
): RadiusMatch<P>[] {
  // Sphere + cylinder are the existing math; delegate so we get one
  // canonical implementation for the common case.
  if (shape === 'sphere' || shape === 'cylinder') {
    return findParticipantsInRadius(
      participants, positions,
      origin, sizeFt, excludeIds, feetPerSquare,
    );
  }

  const results: RadiusMatch<P>[] = [];

  if (shape === 'cube') {
    // Origin = a corner cell of the cube. RAW is "you choose a point of
    // origin" — we treat the named origin as the near-corner and let
    // the cube extend outward in +row/+col by sizeCells. The picker
    // can flip rows/cols if the player wants the cube to extend in a
    // different direction; for MVP, +/- expansion from origin via
    // bounding box centered at origin reads as "cube around target."
    // Players will place the spell on a target participant, so a
    // centered cube is the more intuitive default.
    const sizeCells = Math.floor(sizeFt / feetPerSquare);
    const half = Math.floor(sizeCells / 2);
    const minRow = origin.row - half;
    const maxRow = origin.row + (sizeCells - half - 1);
    const minCol = origin.col - half;
    const maxCol = origin.col + (sizeCells - half - 1);
    for (const p of participants) {
      if (excludeIds && excludeIds.has(p.id)) continue;
      const pos = positions.get(p.id);
      if (!pos) continue;
      if (pos.row < minRow || pos.row > maxRow) continue;
      if (pos.col < minCol || pos.col > maxCol) continue;
      const dCells = Math.max(Math.abs(pos.row - origin.row), Math.abs(pos.col - origin.col));
      results.push({ participant: p, distanceFt: dCells * feetPerSquare });
    }
    return results;
  }

  if (shape === 'cone') {
    // Cone: apex at origin (caster), opens toward `toward`. Half-angle
    // ~53° → cos = 0.6. Test each candidate with:
    //   1) distance from apex ≤ size (length cap)
    //   2) dot(normalize(apex→target), normalize(apex→candidate)) ≥ cos
    if (!toward) return results;
    const lengthCells = Math.ceil(sizeFt / feetPerSquare);
    // Direction vector from apex to target. Treat row/col as (y, x).
    const dx = toward.col - origin.col;
    const dy = toward.row - origin.row;
    const dirLen = Math.sqrt(dx * dx + dy * dy);
    if (dirLen < 1e-6) return results; // degenerate — caster IS target
    const ndx = dx / dirLen;
    const ndy = dy / dirLen;
    for (const p of participants) {
      if (excludeIds && excludeIds.has(p.id)) continue;
      const pos = positions.get(p.id);
      if (!pos) continue;
      const cdx = pos.col - origin.col;
      const cdy = pos.row - origin.row;
      const candLen = Math.sqrt(cdx * cdx + cdy * cdy);
      if (candLen < 1e-6) continue; // candidate IS the caster — skip
      if (candLen > lengthCells) continue;
      const dot = (cdx * ndx + cdy * ndy) / candLen;
      if (dot >= CONE_COSINE_HALF_ANGLE) {
        results.push({ participant: p, distanceFt: Math.round(candLen) * feetPerSquare });
      }
    }
    return results;
  }

  if (shape === 'line') {
    // Line: from caster (origin) toward `toward`, length sizeFt, half-
    // width LINE_HALF_WIDTH_FT (2.5ft per side = 5ft total per RAW).
    // Hit test: project candidate onto the line, accept if projection
    // is within [0, lengthCells] and perpendicular distance ≤ halfCells.
    if (!toward) return results;
    const lengthCells = sizeFt / feetPerSquare;
    const halfWidthCells = LINE_HALF_WIDTH_FT / feetPerSquare;
    const dx = toward.col - origin.col;
    const dy = toward.row - origin.row;
    const dirLen = Math.sqrt(dx * dx + dy * dy);
    if (dirLen < 1e-6) return results;
    const ndx = dx / dirLen;
    const ndy = dy / dirLen;
    for (const p of participants) {
      if (excludeIds && excludeIds.has(p.id)) continue;
      const pos = positions.get(p.id);
      if (!pos) continue;
      const cdx = pos.col - origin.col;
      const cdy = pos.row - origin.row;
      // Projection along line
      const along = cdx * ndx + cdy * ndy;
      if (along < 0 || along > lengthCells) continue;
      // Perpendicular distance (cross-product magnitude in 2D)
      const perp = Math.abs(cdx * ndy - cdy * ndx);
      if (perp > halfWidthCells) continue;
      results.push({ participant: p, distanceFt: Math.round(along) * feetPerSquare });
    }
    return results;
  }

  return results;
}
