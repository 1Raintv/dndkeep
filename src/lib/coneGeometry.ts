// v2.444.0 — Cone hit-detection for AOE save actions.
//
// Given an apex (the dragon), a direction-toward point (where the
// player clicked / hovered), a length in feet, and a list of
// candidate participant positions, returns the participants whose
// token center is INSIDE the cone.
//
// Geometry: the cone is RAW-style "as wide as it is long" — at
// distance d from apex, the half-width is d. This matches the
// existing Pixi cone renderer (BattleMapV2.tsx ~L1577) so the
// visual cone exactly equals the selection cone. Total apex angle:
// 2 × atan(1) = 90°. Strict 5e RAW gives 53.13° (apex angle
// 2 × atan(0.5)) — keeping the wider geometry for now since the
// renderer ships it; switching both at once is a future ship.
//
// Coordinate convention: world pixels, matching the renderer
// (which reads aoePreview.centerWorldX/Y / directionWorldX/Y).
// Caller is responsible for converting (row, col) grid positions
// to world pixels using the same convention as the renderer:
// `worldX = col * gridSize + gridSize/2`.
//
// Distance: Euclidean in pixels, then converted to feet via
// gridSize (5 ft per cell). Strict RAW would use Chebyshev
// (king's-move) distance for cone reach, but cones are
// directional and Chebyshev produces an unintuitive square
// gradient that doesn't match the visual triangle. Using
// Euclidean here matches what the player sees.

export interface ConeTarget<T> {
  participant: T;
  worldX: number;
  worldY: number;
}

export interface ConeHit<T> {
  participant: T;
  /** Distance from apex in feet (rounded). For sort + display. */
  distFt: number;
}

/**
 * Compute which participants fall inside a cone.
 *
 * @param apexX/apexY     World pixels — cone origin (caster's center).
 * @param dirX/dirY       World pixels — point cursor is aimed at.
 *                        The direction vector is (dirX-apexX, dirY-apexY).
 * @param lengthFt        Cone reach in feet (e.g. 90 for AWD's Cold Breath).
 * @param gridSizePx      Pixels per cell (5 ft).
 * @param candidates      Participants with their world center coords.
 * @returns Hits sorted by distance ascending. Empty array if direction
 *          vector is zero (no aim) — caller decides what to do.
 */
export function findParticipantsInCone<T>(
  apexX: number,
  apexY: number,
  dirX: number,
  dirY: number,
  lengthFt: number,
  gridSizePx: number,
  candidates: ConeTarget<T>[],
): ConeHit<T>[] {
  const ddx = dirX - apexX;
  const ddy = dirY - apexY;
  const dirLen = Math.sqrt(ddx * ddx + ddy * ddy);
  if (dirLen < 1e-3) return []; // no aim
  const ndx = ddx / dirLen;     // unit direction vector
  const ndy = ddy / dirLen;
  // Perpendicular unit vector (rotated 90° CCW). For a hit test we
  // need each candidate's distance ALONG the cone axis (forward) and
  // PERPENDICULAR to it (lateral). Inside iff:
  //   forward >= 0
  //   forward <= lengthPx
  //   |lateral| <= forward         (cone widens 1:1 with forward; matches renderer)
  const px = -ndy;
  const py = ndx;
  const lengthPx = (lengthFt / 5) * gridSizePx;

  const hits: ConeHit<T>[] = [];
  for (const c of candidates) {
    const vx = c.worldX - apexX;
    const vy = c.worldY - apexY;
    const forward = vx * ndx + vy * ndy;
    if (forward <= 0) continue;          // behind or at apex
    if (forward > lengthPx) continue;    // beyond reach
    const lateral = Math.abs(vx * px + vy * py);
    if (lateral > forward) continue;     // outside the 90° apex angle
    const distPx = Math.sqrt(vx * vx + vy * vy);
    const distFt = Math.round((distPx / gridSizePx) * 5);
    hits.push({ participant: c.participant, distFt });
  }
  hits.sort((a, b) => a.distFt - b.distFt);
  return hits;
}

/**
 * Detect a "X-foot cone" reach from an action description. Returns
 * the cone length in feet, or null when the desc isn't cone-shaped.
 *
 * Patterns matched (case-insensitive):
 *   "90-foot cone"
 *   "90 foot cone"
 *   "in a 90-foot cone"
 *   "exhales an icy blast in a 90-foot cone"   (AWD's actual desc)
 *
 * Patterns NOT matched (other AOE shapes, single-target):
 *   "20-foot radius"
 *   "5-foot line"
 *   "within 30 feet"
 */
export function parseConeReachFt(desc: string | undefined): number | null {
  if (!desc) return null;
  const m = desc.match(/(\d+)[-\s]?foot\s+cone/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
