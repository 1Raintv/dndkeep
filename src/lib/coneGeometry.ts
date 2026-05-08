// v2.451.0 — Cone hit-detection for AOE save actions.
//
// Given an apex (the geometric center of the caster's footprint), a
// direction-toward point (where the player aimed), a length in feet,
// and a list of candidate participant footprints, returns the
// participants whose FOOTPRINT AABB intersects the cone triangle.
//
// Geometry (RAW 5e 2024): cone apex angle 2 × atan(0.5) = 53.13°.
// At distance d from apex, half-width is d / 2 (so the cone is "as
// wide as it is long" at the far edge — total width = length).
// v2.444.0–v2.450 used a wider 90° cone (half-width = forward) to
// match the original renderer; v2.451.0 tightens both the renderer
// and this hit-test together so visual = selection still holds.
//
// Hit-test: SAT (Separating Axis Theorem) between the cone triangle
// and each candidate's footprint AABB. 5 candidate axes — world X,
// world Y, and the three triangle-edge normals. If projections
// disagree on ANY axis, no intersection. Upgraded from v2.444's
// single-point center test so a Large+ creature near the cone's
// edge resolves correctly: at narrow angles a 5ft-cell center can
// fall outside the cone while the 4×4 footprint clearly clips it.
//
// Coordinate convention: world pixels, matching the renderer.
// Caller is responsible for converting (row, col, sizeCells) plus
// odd/even anchor semantics into footprint world-pixel min/max
// corners. See MonsterActionPanel.tokenFootprintAABBPx.

export interface ConeTarget<T> {
  participant: T;
  /** Footprint AABB in world pixels — bounding box of every cell
   *  the creature occupies. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ConeHit<T> {
  participant: T;
  /** Distance from apex to footprint center, in feet (rounded).
   *  For sort + display in the multi-save summary. */
  distFt: number;
}

/**
 * Compute which participants' footprints intersect a cone triangle.
 *
 * @param apexX/apexY     World pixels — cone origin (caster's footprint center).
 * @param dirX/dirY       World pixels — point cursor is aimed at.
 * @param lengthFt        Cone reach in feet.
 * @param gridSizePx      Pixels per cell (5 ft).
 * @param candidates      Participants with their footprint AABBs.
 * @returns Hits sorted by distance ascending. Empty array when the
 *          direction vector is zero (no aim).
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
  const ndx = ddx / dirLen;     // unit forward
  const ndy = ddy / dirLen;
  // Perpendicular unit (rotated 90° CCW).
  const px = -ndy;
  const py = ndx;
  const lengthPx = (lengthFt / 5) * gridSizePx;
  // RAW: half-width at far edge = lengthPx / 2. (Cone is as wide as
  // it is long — total far-edge width = lengthPx.)
  const halfFarPx = lengthPx / 2;

  // Cone triangle vertices in world coords.
  const farCenterX = apexX + ndx * lengthPx;
  const farCenterY = apexY + ndy * lengthPx;
  const leftX = farCenterX + px * halfFarPx;
  const leftY = farCenterY + py * halfFarPx;
  const rightX = farCenterX - px * halfFarPx;
  const rightY = farCenterY - py * halfFarPx;

  // Pre-compute the cone's world-X/Y bounds for the cardinal SAT
  // axes. Reused per candidate.
  const triMinX = Math.min(apexX, leftX, rightX);
  const triMaxX = Math.max(apexX, leftX, rightX);
  const triMinY = Math.min(apexY, leftY, rightY);
  const triMaxY = Math.max(apexY, leftY, rightY);

  // Pre-compute the 3 triangle-edge normals (axes 3-5). Each edge
  // (v1 → v2) has normal (-(v2.y - v1.y), v2.x - v1.x). Length
  // doesn't matter for SAT — only the axis direction does, so we
  // skip normalization. We also pre-compute the cone's projection
  // interval on each normal (axis-fixed; same for every candidate).
  const triVerts: Array<[number, number]> = [
    [apexX, apexY],
    [leftX, leftY],
    [rightX, rightY],
  ];
  const edges: Array<[number, number, number, number]> = [
    [apexX, apexY, leftX, leftY],
    [leftX, leftY, rightX, rightY],
    [rightX, rightY, apexX, apexY],
  ];
  const edgeAxes: Array<{ nx: number; ny: number; triMin: number; triMax: number }> = [];
  for (const [x1, y1, x2, y2] of edges) {
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    let mn = Infinity, mx = -Infinity;
    for (const [vx, vy] of triVerts) {
      const proj = vx * nx + vy * ny;
      if (proj < mn) mn = proj;
      if (proj > mx) mx = proj;
    }
    edgeAxes.push({ nx, ny, triMin: mn, triMax: mx });
  }

  const hits: ConeHit<T>[] = [];
  for (const c of candidates) {
    // SAT axis 1: world X.
    if (c.maxX < triMinX || c.minX > triMaxX) continue;
    // SAT axis 2: world Y.
    if (c.maxY < triMinY || c.minY > triMaxY) continue;
    // SAT axes 3-5: triangle edge normals. Project the 4 footprint
    // corners onto each axis, compare with the pre-computed cone
    // interval. Disjoint on any axis → no intersection.
    const corners: Array<[number, number]> = [
      [c.minX, c.minY],
      [c.maxX, c.minY],
      [c.maxX, c.maxY],
      [c.minX, c.maxY],
    ];
    let separated = false;
    for (const { nx, ny, triMin, triMax } of edgeAxes) {
      let fpMin = Infinity, fpMax = -Infinity;
      for (const [x, y] of corners) {
        const proj = x * nx + y * ny;
        if (proj < fpMin) fpMin = proj;
        if (proj > fpMax) fpMax = proj;
      }
      if (fpMax < triMin || fpMin > triMax) {
        separated = true;
        break;
      }
    }
    if (separated) continue;

    // All 5 axes overlap → footprint intersects cone.
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
