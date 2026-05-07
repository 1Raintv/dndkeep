// v2.450.0 — Line hit-detection for AOE save actions.
//
// Mirrors coneGeometry.ts but for lines: a fixed-width rectangle
// extending from an apex (the dragon) toward a direction-toward
// point (where the player aimed). Returns participants whose
// FOOTPRINT (axis-aligned box of their occupied cells) intersects
// the line rectangle.
//
// Unlike the cone version — which checks token center against a
// triangle — lines must check the full footprint. A 60ft line is
// only 1 cell wide, so a Large+ creature is easily clipped at an
// angle: the cell center could miss the line while the footprint's
// far cells clearly overlap. RAW: "any creature in the line's area
// is affected" — taken to mean any square the creature occupies
// overlaps the line's area. We use a Separating Axis Theorem
// (SAT) test between the footprint AABB and the line OBB.
//
// Coordinate convention: world pixels, matching the renderer
// (BattleMapV2.tsx ~L1609 line branch). Caller is responsible for
// converting (row, col, sizeCells) plus odd/even anchor semantics
// into the footprint's world-pixel min/max corners. See
// MonsterActionPanel.linePickingFor effect for that conversion.

export interface LineTarget<T> {
  participant: T;
  /** Footprint AABB in world pixels — the bounding box of every
   *  cell the creature occupies. For 1×1 tokens this is just the
   *  single cell; for Large+ tokens it spans the full footprint. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LineHit<T> {
  participant: T;
  /** Distance from apex to footprint center, in feet (rounded).
   *  Used for stable sort + display in the multi-save summary. */
  distFt: number;
}

/**
 * Compute which participants' footprints intersect a line rectangle.
 *
 * Geometry: line is an OBB rooted at the apex, extending lengthFt
 * forward toward (dirX, dirY) with full width widthFt (centered on
 * the line's axis — half on each side).
 *
 * Algorithm: SAT with 4 candidate axes — line's forward + lateral
 * unit vectors, and the world's cardinal x/y (footprint axes). On
 * any axis where the two intervals are disjoint, no intersection.
 *
 * @param apexX/apexY     World pixels — line origin (caster's cell center).
 * @param dirX/dirY       World pixels — point cursor is aimed at.
 * @param lengthFt        Line length in feet (e.g. 60 for an Adult Brass line).
 * @param widthFt         Line width in feet (5 for every dragon line in SRD).
 * @param gridSizePx      Pixels per cell (5 ft).
 * @param candidates      Participants with their footprint AABBs.
 * @returns Hits sorted by distance ascending. Empty when direction
 *          vector is zero (no aim) — caller decides what to do.
 */
export function findParticipantsInLine<T>(
  apexX: number,
  apexY: number,
  dirX: number,
  dirY: number,
  lengthFt: number,
  widthFt: number,
  gridSizePx: number,
  candidates: LineTarget<T>[],
): LineHit<T>[] {
  const ddx = dirX - apexX;
  const ddy = dirY - apexY;
  const dirLen = Math.sqrt(ddx * ddx + ddy * ddy);
  if (dirLen < 1e-3) return []; // no aim
  const ndx = ddx / dirLen;     // unit forward
  const ndy = ddy / dirLen;
  // Perpendicular unit (90° CCW). Together with (ndx,ndy) they form
  // the line's local basis.
  const px = -ndy;
  const py = ndx;
  const lengthPx = (lengthFt / 5) * gridSizePx;
  const halfWidthPx = (widthFt / 5) * gridSizePx / 2;

  // Pre-compute the line OBB's 4 world-space corners. Used for SAT
  // axis #2 (the cardinal axes) — we project these onto world X,Y
  // and compare against the footprint AABB's bounds.
  //  near-left, near-right, far-left, far-right (relative to forward)
  const lnx = apexX + px * halfWidthPx;
  const lny = apexY + py * halfWidthPx;
  const rnx = apexX - px * halfWidthPx;
  const rny = apexY - py * halfWidthPx;
  const lfx = apexX + ndx * lengthPx + px * halfWidthPx;
  const lfy = apexY + ndy * lengthPx + py * halfWidthPx;
  const rfx = apexX + ndx * lengthPx - px * halfWidthPx;
  const rfy = apexY + ndy * lengthPx - py * halfWidthPx;
  const lineMinX = Math.min(lnx, rnx, lfx, rfx);
  const lineMaxX = Math.max(lnx, rnx, lfx, rfx);
  const lineMinY = Math.min(lny, rny, lfy, rfy);
  const lineMaxY = Math.max(lny, rny, lfy, rfy);

  const hits: LineHit<T>[] = [];
  for (const c of candidates) {
    // SAT axis #1: world X. (Footprint is AABB → its projection on
    // X is [c.minX, c.maxX]; line's projection is [lineMinX, lineMaxX].)
    if (c.maxX < lineMinX || c.minX > lineMaxX) continue;
    // SAT axis #2: world Y.
    if (c.maxY < lineMinY || c.minY > lineMaxY) continue;
    // SAT axis #3 + #4: line-local forward + lateral. Project the
    // 4 footprint corners onto each, test interval overlap with the
    // line's local extents [0, lengthPx] × [-halfWidthPx, halfWidthPx].
    const corners: Array<[number, number]> = [
      [c.minX, c.minY],
      [c.maxX, c.minY],
      [c.maxX, c.maxY],
      [c.minX, c.maxY],
    ];
    let minF = Infinity, maxF = -Infinity, minL = Infinity, maxL = -Infinity;
    for (const [x, y] of corners) {
      const dx = x - apexX;
      const dy = y - apexY;
      const f = dx * ndx + dy * ndy;
      const l = dx * px + dy * py;
      if (f < minF) minF = f;
      if (f > maxF) maxF = f;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    if (maxF < 0 || minF > lengthPx) continue;
    if (maxL < -halfWidthPx || minL > halfWidthPx) continue;

    // All 4 SAT axes overlap → footprint intersects line.
    // Distance metric for sort/display: euclidean apex→footprint-center
    // in feet. Center is the AABB midpoint.
    const cx = (c.minX + c.maxX) / 2;
    const cy = (c.minY + c.maxY) / 2;
    const vx = cx - apexX;
    const vy = cy - apexY;
    const distPx = Math.sqrt(vx * vx + vy * vy);
    const distFt = Math.round((distPx / gridSizePx) * 5);
    hits.push({ participant: c.participant, distFt });
  }
  hits.sort((a, b) => a.distFt - b.distFt);
  return hits;
}

/**
 * Detect "X-foot line[, Y feet wide]" reach from an action description.
 * Returns length + width in feet, or null when the desc isn't line-shaped.
 *
 * Patterns matched (case-insensitive):
 *   "60-foot line"                    → length=60, width=5 (default)
 *   "60 foot line"                    → length=60, width=5
 *   "60-foot line that is 5 ft wide"  → length=60, width=5
 *   "60-foot line, 10 feet wide"      → length=60, width=10
 *   "exhales lightning in a 60-foot line that is 5 feet wide"
 *
 * Patterns NOT matched (other AOE shapes):
 *   "20-foot radius" / "60-foot cone" / "5-foot cube"
 *
 * Default width: 5ft. Every dragon breath line in the 5e SRD/2024
 * is 5ft wide; plumbing the explicit width matters for non-dragon
 * line effects (e.g. Lightning Bolt at 100ft × 5ft is also 5ft, but
 * the parser shouldn't silently invent that for unrelated text).
 */
export function parseLineDimensionsFt(
  desc: string | undefined,
): { lengthFt: number; widthFt: number } | null {
  if (!desc) return null;
  const m = desc.match(/(\d+)[-\s]?foot\s+line/i);
  if (!m) return null;
  const lengthFt = parseInt(m[1], 10);
  if (!Number.isFinite(lengthFt) || lengthFt <= 0) return null;
  // Optional width clause AFTER the line phrase. Common forms:
  // "...line that is 5 feet wide", "...line, 10 ft wide", "...line 5 feet wide".
  // Grab whatever appears within ~40 chars after "line" to avoid
  // accidentally matching a width from a later sentence.
  const tail = desc.slice(desc.toLowerCase().indexOf('line') + 4, desc.length).slice(0, 60);
  const wm = tail.match(/(\d+)\s*(?:ft|foot|feet)\s+wide/i);
  const widthFt = wm ? parseInt(wm[1], 10) : 5;
  return {
    lengthFt,
    widthFt: Number.isFinite(widthFt) && widthFt > 0 ? widthFt : 5,
  };
}
