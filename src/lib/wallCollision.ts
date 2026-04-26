// v2.268.0 — Wall-blocked movement validation.
//
// When a token is dragged from (originX, originY) to (targetX, targetY),
// we check whether the straight-line path between those two points
// crosses any wall whose `blocksMovement` flag is true. If so, the
// drag is rejected and the token snaps back to its origin.
//
// Why straight-line check (not pathfinding):
// - Tokens are dragged manually by the player, not pathed by an AI.
//   The user sees the token glide from A to B and chose that
//   destination directly. If a wall is in the way, the right behavior
//   is "this is not a legal drop, try again" — not "let me re-route
//   you around the wall." The latter would be magical and confusing.
// - Pathfinding would also need a navmesh, which is significant scope
//   for marginal benefit at this stage.
//
// What about *exactly hitting* a wall endpoint? A drop where the path
// passes through a wall vertex — say walls form a corner and the
// player drags from outside the corner to inside, grazing the vertex —
// is ambiguous. We err on the side of permissive: vertex-grazing
// drops are allowed (open interval at endpoints, same convention as
// the visibility polygon). The visual cue of "your token slipped
// through the gap" is RAW — squeezing through corners is a thing.
// If players abuse this, future ship can tighten the interval.
//
// Door state: walls with `doorState === 'open'` don't block movement
// even when blocksMovement is true. Walls with `doorState === 'closed'`
// or null behave like solid walls. v2.226+ will surface a door toggle
// in the wall context menu; for now all walls are doorless solids.

import type { Wall } from './stores/battleMapStore';

/** Returns true if the segment (x1,y1)→(x2,y2) crosses any wall in
 *  `walls` that blocks movement and isn't an open door. Exposed as a
 *  named predicate so call sites read clearly:
 *
 *    if (segmentBlockedByWall(t.x, t.y, snapped.x, snapped.y, walls)) {
 *      // reject drop, snap back, show toast
 *    }
 */
export function segmentBlockedByWall(
  x1: number, y1: number,
  x2: number, y2: number,
  walls: Wall[],
): boolean {
  for (const w of walls) {
    if (!w.blocksMovement) continue;
    if (w.doorState === 'open') continue;
    if (segmentsIntersect(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2)) {
      return true;
    }
  }
  return false;
}

/** Pure boolean variant of the segment-segment intersection test.
 *  Same parametric solve as the vision polygon's helper, but returns
 *  bool instead of the intersection point — and uses a SLIGHTLY
 *  tighter interval on the wall side so a token passing exactly
 *  through a wall endpoint is allowed (squeeze-through-corner).
 *
 *  Convention:
 *    Path side (drag segment):  t ∈ (0, 1) — endpoints open. A drop
 *      that lands ON a wall (target sits exactly on the wall line) is
 *      treated as not-yet-crossing, and is allowed. The next drag
 *      from there will need to cross.
 *    Wall side: u ∈ (0, 1) — endpoints open. Lets tokens slip past a
 *      wall vertex into an adjacent cell.
 *
 *  Both intervals are open so degenerate "touch but don't cross"
 *  cases default to allow. This is intentionally permissive; fixing
 *  edge cases is cheaper than over-blocking the player. */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const r_x = bx - ax;
  const r_y = by - ay;
  const s_x = dx - cx;
  const s_y = dy - cy;
  const denom = r_x * s_y - r_y * s_x;

  if (Math.abs(denom) < 1e-9) return false; // parallel / collinear

  const t = ((cx - ax) * s_y - (cy - ay) * s_x) / denom;
  const u = ((cx - ax) * r_y - (cy - ay) * r_x) / denom;

  return t > 0 && t < 1 && u > 0 && u < 1;
}
