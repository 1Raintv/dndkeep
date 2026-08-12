// v2.652.0 — Cover: the domain layer.
//
// Cover math lived in two half-places before this: `battleMapGeometry`
// owned the wall derivation (and imports supabase, so it can never be
// unit-tested cheaply), and the AC bonus was re-derived inline inside
// `pendingAttack.resolveAttack`. This module is the single pure home —
// levels, the RAW combination rule, the AC/save bonuses, and the grid
// geometry needed to ask "is something standing between these two?".
//
// Zero imports by design (see docs/CODING_STANDARDS.md): the whole
// rules suite has to keep running in ~1 s with no vi.mock ceremony.
// `battleMapGeometry` re-exports the pieces its existing callers
// already import, so nothing downstream had to move.
//
// RAW reference — 2024 PHB p.24 "Cover":
//   Half cover (+2 AC, +2 Dex saves)   — obstacle blocks ≥ half the
//       target. Listed examples include *another creature*.
//   Three-quarters cover (+5 AC, +5)   — portcullis, arrow slit.
//   Total cover                        — can't be targeted directly.
//   "If a target is behind multiple sources of cover, only the most
//    protective degree of cover applies" — hence bestCover(), NOT a sum.

export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'total';

export type CreatureSizeKey =
  | 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

/** Protection ordering. Used by {@link bestCover} — never persisted. */
const COVER_RANK: Record<CoverLevel, number> = {
  none: 0,
  half: 1,
  three_quarters: 2,
  total: 3,
};

/**
 * RAW combination: the most protective source wins. Sources do NOT add
 * up — a creature (half) standing in front of a low wall (half) is still
 * half cover, not three-quarters.
 *
 * Note this is deliberately different from {@link pointsToCoverLevel},
 * which buckets *wall* points. Multiple walls on one line of effect are
 * summed by the v2.145 model (a legacy untyped wall carries no type
 * info, so stacking is the only signal available); once that sum has
 * produced a level, THIS function is what merges it with other sources.
 */
export function bestCover(...levels: CoverLevel[]): CoverLevel {
  let best: CoverLevel = 'none';
  for (const lvl of levels) {
    if (COVER_RANK[lvl] > COVER_RANK[best]) best = lvl;
  }
  return best;
}

/** True when `a` is strictly more protective than `b`. */
export function isMoreCover(a: CoverLevel, b: CoverLevel): boolean {
  return COVER_RANK[a] > COVER_RANK[b];
}

/**
 * AC bonus granted by cover. Total cover returns 0 because it isn't a
 * bonus at all — the attack simply can't be made, which callers gate on
 * separately (see `pendingAttack.resolveAttack`: total cover forces a
 * miss even on a natural 20).
 */
export function coverAcBonus(level: CoverLevel): number {
  return level === 'half' ? 2 : level === 'three_quarters' ? 5 : 0;
}

/** Dex-save bonus granted by cover. Same numbers as {@link coverAcBonus}. */
export function coverSaveBonus(level: CoverLevel): number {
  return coverAcBonus(level);
}

/** Display label, e.g. for chips and tooltips. */
export function coverLabel(level: CoverLevel): string {
  switch (level) {
    case 'half':           return 'Half cover';
    case 'three_quarters': return '¾ cover';
    case 'total':          return 'Total cover';
    default:               return 'No cover';
  }
}

/**
 * Map summed wall cover-points to a level. Moved here verbatim from
 * battleMapGeometry (v2.145.0) so every cover consumer reads one
 * bucketing table; that module re-exports it.
 */
export function pointsToCoverLevel(points: number): CoverLevel {
  if (points <= 0) return 'none';
  if (points <= 1) return 'half';
  if (points <= 2) return 'three_quarters';
  return 'total';
}

// ─── Size ─────────────────────────────────────────────────────────

/** Size categories in ascending order; index = the comparison rank. */
export const SIZE_ORDER: readonly CreatureSizeKey[] =
  ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;

const SIZE_RANK: Record<CreatureSizeKey, number> = {
  tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gargantuan: 5,
};

/**
 * Rank a size label defensively. Accepts the mixed casing that flows
 * through the app ('Medium' from `species.ts` / `CreatureSize`, 'medium'
 * from `scene_tokens.size` / `TokenSize`) and falls back to Medium for
 * anything unrecognised — an unknown size must never silently strip a
 * creature's ability to grant cover.
 */
export function sizeRank(size: string | null | undefined): number {
  const key = (size ?? '').toLowerCase() as CreatureSizeKey;
  return SIZE_RANK[key] ?? SIZE_RANK.medium;
}

/** Normalise any size string to a {@link CreatureSizeKey} (Medium default). */
export function toSizeKey(size: string | null | undefined): CreatureSizeKey {
  const key = (size ?? '').toLowerCase() as CreatureSizeKey;
  return key in SIZE_RANK ? key : 'medium';
}

/**
 * How much smaller than you an intervening creature may be and still be
 * worth hiding behind. RAW is silent — the 2024 PHB just lists "another
 * creature" as a half-cover obstacle with no size qualifier — so this is
 * our documented interpretation, not a quoted rule: a body only blocks
 * your outline if it's roughly your bulk. One category of slack means a
 * Medium fighter can duck behind a Small ally but not behind a Tiny
 * familiar (two categories down).
 *
 * This constant is the seam the queued "choose your character's size"
 * work plugs into — a player who picks Small for their Tiefling starts
 * being able to take cover behind Tiny creatures, and stops granting
 * cover to Large allies.
 */
export const CREATURE_COVER_MAX_SIZE_GAP = 1;

/**
 * Cover an intervening creature grants to a target it stands in front of.
 *
 * Always half or none: RAW lists creatures only under half cover, and a
 * creature can never grant total cover (you can always be targeted
 * *through* someone — that's what the -5/+10 sharpshooter debate exists
 * for). Larger blockers do not upgrade to ¾; that would be a house rule.
 */
export function creatureCoverContribution(
  blockerSize: string | null | undefined,
  targetSize: string | null | undefined,
): CoverLevel {
  const gap = sizeRank(targetSize) - sizeRank(blockerSize);
  return gap <= CREATURE_COVER_MAX_SIZE_GAP ? 'half' : 'none';
}

// ─── Grid geometry ────────────────────────────────────────────────
//
// Cells are 0-indexed anchor coordinates, matching what
// `loadActiveBattleMap` produces (row = floor(y / gridSize)). A cell's
// pixel box is therefore [col*g, (col+1)*g) × [row*g, (row+1)*g) and its
// centre is at ((col + 0.5) * g, (row + 0.5) * g).

export interface GridCell {
  row: number;
  col: number;
}

/** Inclusive cell range — the footprint of a Large+ token. */
export interface CellRect {
  rMin: number;
  rMax: number;
  cMin: number;
  cMax: number;
}

/** Pixel centre of a cell. */
export function cellCenterPx(cell: GridCell, gridSize: number): { x: number; y: number } {
  return {
    x: (cell.col + 0.5) * gridSize,
    y: (cell.row + 0.5) * gridSize,
  };
}

/** True when `cell` falls inside the inclusive rect. */
export function rectContainsCell(rect: CellRect, cell: GridCell): boolean {
  return cell.row >= rect.rMin && cell.row <= rect.rMax
      && cell.col >= rect.cMin && cell.col <= rect.cMax;
}

/**
 * Chebyshev (king's-move) gap in cells between two footprints. 0 when
 * they overlap, 1 when they're adjacent including diagonally.
 */
export function rectGapCells(a: CellRect, b: CellRect): number {
  const rowGap = Math.max(0, a.rMin - b.rMax, b.rMin - a.rMax);
  const colGap = Math.max(0, a.cMin - b.cMax, b.cMin - a.cMax);
  return Math.max(rowGap, colGap);
}

/**
 * Classic 2D segment-segment intersection via parametric form. Segments
 * AB and CD intersect iff the solved parameters t and u are both in
 * [0, 1].
 *
 * Returns true for proper intersections AND for T-junction endpoints (a
 * ray that JUST grazes a wall endpoint still counts as crossing).
 * Returns false for collinear-but-non-overlapping cases — walls on the
 * same line as the ray are edge cases the DM can resolve manually.
 *
 * Moved here from battleMapGeometry (v2.131.0) unchanged; that module
 * re-exports it. NOTE: `wallCollision.ts` keeps its own *open-interval*
 * variant on purpose — movement blocking wants "touching a corner is
 * allowed", the opposite of what cover wants. That one is a deliberate
 * second convention, not a duplicate to collapse.
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
 * Does the pixel-space segment AB pass through the axis-aligned box of
 * this cell rect? Tests the four edges rather than doing a full
 * clip — the ray's endpoints are creature centres that sit *outside*
 * the blocker (callers exclude the attacker and target), so an
 * edge-crossing test is sufficient and cheaper than Liang-Barsky.
 */
export function segmentIntersectsCellRect(
  ax: number, ay: number, bx: number, by: number,
  rect: CellRect,
  gridSize: number,
): boolean {
  const x1 = rect.cMin * gridSize;
  const y1 = rect.rMin * gridSize;
  const x2 = (rect.cMax + 1) * gridSize;
  const y2 = (rect.rMax + 1) * gridSize;
  return segmentsIntersect(ax, ay, bx, by, x1, y1, x2, y1)   // top
      || segmentsIntersect(ax, ay, bx, by, x2, y1, x2, y2)   // right
      || segmentsIntersect(ax, ay, bx, by, x1, y2, x2, y2)   // bottom
      || segmentsIntersect(ax, ay, bx, by, x1, y1, x1, y2);  // left
}

// ─── Creature cover ───────────────────────────────────────────────

/** A creature that might be standing in the way. */
export interface CoverBlocker {
  /** Stable id — participant id, token id, whatever the caller keys on. */
  id: string;
  name?: string;
  size: CreatureSizeKey;
  footprint: CellRect;
}

export interface BlockerContribution {
  id: string;
  name?: string;
  level: CoverLevel;
}

export interface CreatureCoverResult {
  /** Most protective single contribution (RAW: cover does not stack). */
  level: CoverLevel;
  /** Every creature that actually sits on the line, best-first. */
  blockers: BlockerContribution[];
}

const NO_CREATURE_COVER: CreatureCoverResult = { level: 'none', blockers: [] };

/**
 * Cover the target gets from creatures standing between it and the
 * attacker, along the centre-to-centre line of effect.
 *
 * The attacker's and target's own footprints are skipped even if the
 * caller forgot to filter them out — a token cannot take cover behind
 * itself, and with Large+ footprints an id-only filter is easy to get
 * subtly wrong.
 *
 * Centre-to-centre (rather than "any corner to any corner") is the same
 * convention the wall derivation has used since v2.131, so the two
 * agree about what "between" means. Its practical effect: a creature
 * merely diagonal to you usually does NOT block, which matches how
 * most VTTs adjudicate this.
 */
export function deriveCoverFromCreatures(
  from: GridCell,
  to: GridCell,
  targetSize: string | null | undefined,
  blockers: readonly CoverBlocker[],
  gridSize: number,
): CreatureCoverResult {
  if (blockers.length === 0) return NO_CREATURE_COVER;

  const a = cellCenterPx(from, gridSize);
  const b = cellCenterPx(to, gridSize);
  const hits: BlockerContribution[] = [];

  for (const blocker of blockers) {
    if (rectContainsCell(blocker.footprint, from)) continue;   // the attacker
    if (rectContainsCell(blocker.footprint, to)) continue;     // the target
    if (!segmentIntersectsCellRect(a.x, a.y, b.x, b.y, blocker.footprint, gridSize)) continue;

    const level = creatureCoverContribution(blocker.size, targetSize);
    if (level === 'none') continue;   // too small to hide behind
    hits.push({ id: blocker.id, name: blocker.name, level });
  }

  if (hits.length === 0) return NO_CREATURE_COVER;
  hits.sort((x, y) => COVER_RANK[y.level] - COVER_RANK[x.level]);
  return { level: hits[0].level, blockers: hits };
}

// ─── Cover from walls ─────────────────────────────────────────────
//
// Moved here from battleMapGeometry (v2.130–v2.145) so the whole cover
// picture is derivable without touching supabase — the battle map's own
// badge needs this math and must not drag the DB client into its bundle.
// `CoverWall` is structural: `battleMapGeometry.WallSegment` and the
// store's `Wall` both satisfy it.

export interface CoverWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** v2.145.0 — wall type determines cover contribution.
   *    'wall'   — solid wall; single wall alone = total cover
   *    'low'    — low wall / furniture; single alone = half cover
   *    'window' — arrow slit / portcullis / barred window; single = ¾
   *    'door'   — closed door; single = total cover (treat as solid)
   *    undefined/null — legacy untyped wall; treated as a small obstacle
   *    so existing maps keep their multi-wall-stacking behavior
   *    (1 wall → half, 2 → ¾, 3+ → total).
   *
   *  v2.661: now populated. `scene_walls.wall_type` stores the
   *  material, the wall toolbar authors it, and `coverWalls` in
   *  battlemap/coverState.ts resolves it — mapping a closed door to
   *  'door' from `doorState` rather than from the stored column.
   *  Walls drawn before v2.661 stay NULL and keep the legacy
   *  behavior; the migration documents the opt-in backfill. */
  type?: 'wall' | 'low' | 'window' | 'door' | null;
}

/** Cover-point contribution per wall type. See {@link CoverWall.type}. */
export function wallCoverPoints(w: CoverWall): number {
  switch (w.type) {
    case 'wall':   return 3;   // alone → total
    case 'door':   return 3;   // alone → total (closed)
    case 'window': return 2;   // alone → three_quarters
    case 'low':    return 1;   // alone → half
    default:       return 1;   // legacy: preserves 1=half / 2=¾ / 3+=total
  }
}

/**
 * Cover from walls crossing the line of effect. Points from every
 * crossed wall are summed and bucketed by {@link pointsToCoverLevel} —
 * the v2.145 model, kept as-is because an untyped wall carries no
 * information other than "there is something here", so stacking is the
 * only signal available.
 */
export function deriveCoverFromWalls(
  from: GridCell,
  to: GridCell,
  walls: readonly CoverWall[],
  gridSize: number,
): CoverLevel {
  const a = cellCenterPx(from, gridSize);
  const b = cellCenterPx(to, gridSize);
  let points = 0;
  for (const w of walls) {
    if (segmentsIntersect(a.x, a.y, b.x, b.y, w.x1, w.y1, w.x2, w.y2)) {
      points += wallCoverPoints(w);
    }
  }
  return pointsToCoverLevel(points);
}

// ─── The combined picture ─────────────────────────────────────────

export interface CombinedCover {
  /** What actually applies — RAW takes the most protective source. */
  level: CoverLevel;
  /** Contribution from walls alone. */
  fromWalls: CoverLevel;
  /** Contribution from intervening creatures. */
  fromCreatures: CreatureCoverResult;
}

/**
 * Full cover picture for one line of effect.
 *
 * Sources are merged with {@link bestCover}, NOT added: RAW says "only
 * the most protective degree of cover applies", so a creature (half)
 * standing in front of a low wall (half) is still half.
 */
export function combineCover(
  from: GridCell,
  to: GridCell,
  targetSize: string | null | undefined,
  walls: readonly CoverWall[],
  blockers: readonly CoverBlocker[],
  gridSize: number,
): CombinedCover {
  const fromWalls = walls.length > 0
    ? deriveCoverFromWalls(from, to, walls, gridSize)
    : 'none';
  const fromCreatures = deriveCoverFromCreatures(from, to, targetSize, blockers, gridSize);
  return {
    level: bestCover(fromWalls, fromCreatures.level),
    fromWalls,
    fromCreatures,
  };
}

// ─── Summarising cover against a set of threats ───────────────────
//
// Both cover surfaces — the map's per-token badge and the player's
// take-cover chip — need the same judgement call about WHICH threats
// count and WHAT to report. They started with a loop each, and drifted
// within one session: the map learned to ignore threats in other rooms
// while the chip cheerfully listed a skeleton three rooms away as
// something it had cover from. One function now, two thin adapters.

export interface CoverThreat {
  id: string;
  name?: string;
  cell: GridCell;
}

export interface ThreatCoverSummary {
  /** Best creature-derived cover across all live threats. */
  level: CoverLevel;
  /** Distinct creatures doing the blocking. */
  blockerNames: string[];
  /** Live threats this cover applies against. */
  coveredFrom: string[];
  /** Live threats with a clean line to the target. */
  exposedTo: string[];
  /** Threats that could actually attack (see below). */
  liveThreats: number;
}

/**
 * Summarise the cover a target has against a set of threats.
 *
 * Two rules keep the output meaningful rather than ever-present:
 *
 *  1. LIVE THREATS ONLY. A threat already behind TOTAL cover cannot
 *     target the creature at all, so reporting cover from it is noise —
 *     it is in another room. Skipped, and excluded from `liveThreats`.
 *
 *  2. CREATURE-DERIVED ONLY. The summary reports bodies in the way, not
 *     masonry. Walls still decide the real numbers at attack time; they
 *     just can't drive an honest at-a-glance readout yet, because
 *     `CoverWall.type` is unpopulated so every wall scores the legacy
 *     1 point and any three stacked read as "total". Wall-derived
 *     reporting lands with the queued wall-typing work.
 */
export function summariseCoverAgainstThreats(
  self: GridCell,
  selfSize: string | null | undefined,
  threats: readonly CoverThreat[],
  walls: readonly CoverWall[],
  blockers: readonly CoverBlocker[],
  gridSize: number,
): ThreatCoverSummary {
  let level: CoverLevel = 'none';
  let liveThreats = 0;
  const blockerNames = new Set<string>();
  const coveredFrom: string[] = [];
  const exposedTo: string[] = [];

  for (const threat of threats) {
    const derived = combineCover(threat.cell, self, selfSize, walls, blockers, gridSize);
    if (derived.fromWalls === 'total') continue;          // rule 1
    liveThreats++;
    const name = threat.name ?? 'unknown';
    if (derived.fromCreatures.level === 'none') {          // rule 2
      exposedTo.push(name);
      continue;
    }
    coveredFrom.push(name);
    level = bestCover(level, derived.fromCreatures.level);
    for (const b of derived.fromCreatures.blockers) {
      if (b.name) blockerNames.add(b.name);
    }
  }

  return { level, blockerNames: [...blockerNames], coveredFrom, exposedTo, liveThreats };
}

/**
 * Creatures close enough to be worth ducking behind, regardless of any
 * particular attacker. This is what drives the player-facing "you can
 * take cover here" affordance: it answers "is there anything nearby?"
 * cheaply, so the UI can stay silent in the open field and only then
 * do the per-threat work in {@link deriveCoverFromCreatures}.
 *
 * `maxGapCells` is a Chebyshev footprint gap: 1 means orthogonally or
 * diagonally adjacent. Anything further and you'd have to spend
 * movement to get behind it, so it isn't cover you *have*.
 */
export function findNearbyCoverBlockers(
  self: CellRect,
  selfSize: string | null | undefined,
  candidates: readonly CoverBlocker[],
  maxGapCells = 1,
): CoverBlocker[] {
  return candidates.filter(c => {
    if (rectGapCells(self, c.footprint) > maxGapCells) return false;
    if (rectGapCells(self, c.footprint) === 0) return false;   // same space
    return creatureCoverContribution(c.size, selfSize) !== 'none';
  });
}
