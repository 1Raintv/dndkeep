// v2.348.0 — A* pathfinding for click-to-move.
//
// Click-to-move (v2.346) pre-v2.348 used a straight line from origin
// to destination, which failed any time a wall sat between the two —
// L-shaped corridors, rooms with a single doorway, etc. The user had
// to click each leg manually. This A* implementation routes around
// walls and occupied cells, returning the cell sequence the token
// will animate along.
//
// Cost model: Chebyshev (king's-move). Diagonals cost the same as
// orthogonals, matching the 2024 PHB movement rule already used by
// computeChebyshevFt() in lib/movement.ts. Total path length in feet
// = (cells - 1) * 5, where cells includes both endpoints.
//
// Blockers:
//   • walls — segmentBlockedByWall between adjacent cell centers
//     (handles closed doors via Wall.doorState/blocksMovement)
//   • occupants — other tokens occupying a cell. The mover's own
//     token is skipped (we'd otherwise refuse to leave the start cell).
//
// Performance: typical scenes are 30×20 cells (600 nodes). A* with a
// binary-heap-style frontier runs in <1ms. We don't bother with a
// full heap — for this size, a sorted-insert array is faster in
// practice (cache-friendly, no allocation churn).

import type { Wall, Token } from './stores/battleMapStore';
import { segmentBlockedByWall } from './wallCollision';

export interface Cell {
  row: number;
  col: number;
}

interface Node extends Cell {
  /** Cost from start to this node, in cells. */
  g: number;
  /** Estimated total cost (g + heuristic). */
  f: number;
  /** Index into the same Node array, or -1 for the start node. */
  parent: number;
}

const NEIGHBOR_DELTAS: Array<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

/**
 * A* on a cell grid with Chebyshev cost. Returns the cell sequence
 * from `start` (inclusive) to `goal` (inclusive), or null if no path
 * exists. Path length in feet is `(result.length - 1) * 5`.
 *
 * @param maxCells optional cap so we don't waste cycles searching for
 *   moves the actor couldn't afford anyway. Movement budget in cells
 *   = budgetFt / 5. If the cap is exceeded the search aborts and
 *   returns null (caller surfaces "no path within range" — same UX
 *   as overspend on a straight-line move).
 */
export function findPath(
  start: Cell,
  goal: Cell,
  options: {
    widthCells: number;
    heightCells: number;
    gridSizePx: number;
    walls: Wall[];
    /** Tokens whose cells are blocked. Pass an empty array to ignore
     *  occupants entirely (DM repositioning out of combat, etc.). */
    occupants: Token[];
    /** The mover's own token id — its cell is NOT treated as blocked. */
    moverTokenId: string | null;
    /** Optional cap on path length in cells. */
    maxCells?: number;
  },
): Cell[] | null {
  const { widthCells, heightCells, gridSizePx, walls, occupants, moverTokenId, maxCells } = options;

  // Boundary check: start/goal must be on the grid.
  if (
    start.row < 0 || start.row >= heightCells ||
    start.col < 0 || start.col >= widthCells ||
    goal.row < 0  || goal.row >= heightCells ||
    goal.col < 0  || goal.col >= widthCells
  ) return null;

  // Trivial: same cell. Return single-element path.
  if (start.row === goal.row && start.col === goal.col) {
    return [{ row: start.row, col: start.col }];
  }

  // Build occupant set (cell key → true) once. Mover's own cell skipped.
  const occupied = new Set<string>();
  for (const t of occupants) {
    if (t.id === moverTokenId) continue;
    const tRow = Math.round(t.y / gridSizePx);
    const tCol = Math.round(t.x / gridSizePx);
    occupied.add(`${tRow},${tCol}`);
  }
  // The goal cell can be the goal even if not in occupied set; we
  // already ensured occupants have unique cells. If the goal IS
  // occupied (caller forgot to filter), bail early — can't end on
  // another creature.
  if (occupied.has(`${goal.row},${goal.col}`)) return null;

  function cellKey(r: number, c: number) { return `${r},${c}`; }

  function chebyshev(a: Cell, b: Cell): number {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }

  function adjacentCellsBlocked(fromR: number, fromC: number, toR: number, toC: number): boolean {
    // Wall check between the two cells' centers. We use the same
    // segmentBlockedByWall helper that drag/click-to-move use, so a
    // wall blocks if the adjacent move would cross it.
    const fromX = (fromC + 0.5) * gridSizePx;
    const fromY = (fromR + 0.5) * gridSizePx;
    const toX = (toC + 0.5) * gridSizePx;
    const toY = (toR + 0.5) * gridSizePx;
    return segmentBlockedByWall(fromX, fromY, toX, toY, walls);
  }

  // Frontier as parallel arrays. Open is sorted by f ascending; we
  // pop from the front. Slightly worse than a binary heap on huge
  // scenes but well within budget for typical map sizes.
  const nodes: Node[] = [];
  const open: number[] = []; // indices into nodes, sorted by f ASC
  const bestG = new Map<string, number>();

  const startNode: Node = {
    row: start.row, col: start.col,
    g: 0, f: chebyshev(start, goal),
    parent: -1,
  };
  nodes.push(startNode);
  open.push(0);
  bestG.set(cellKey(start.row, start.col), 0);

  while (open.length > 0) {
    const currentIdx = open.shift()!;
    const current = nodes[currentIdx];

    if (current.row === goal.row && current.col === goal.col) {
      // Reconstruct path.
      const path: Cell[] = [];
      let walker: Node | undefined = current;
      while (walker) {
        path.unshift({ row: walker.row, col: walker.col });
        walker = walker.parent >= 0 ? nodes[walker.parent] : undefined;
      }
      return path;
    }

    for (const [dr, dc] of NEIGHBOR_DELTAS) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 0 || nr >= heightCells || nc < 0 || nc >= widthCells) continue;
      const key = cellKey(nr, nc);

      // Goal is allowed even if "occupied" check… we already screened
      // the goal at the top. Other occupied cells are blocked.
      if (occupied.has(key)) continue;

      // Wall check between current and neighbor.
      if (adjacentCellsBlocked(current.row, current.col, nr, nc)) continue;

      // Diagonal corner-cutting check: when moving diagonally, both
      // orthogonal neighbors must be passable. Otherwise a wall along
      // (current,col+1)→(current+1,col+1) would let us slip through
      // its corner. RAW says you can't squeeze through a corner that
      // a wall touches.
      if (dr !== 0 && dc !== 0) {
        if (adjacentCellsBlocked(current.row, current.col, current.row + dr, current.col)) continue;
        if (adjacentCellsBlocked(current.row, current.col, current.row, current.col + dc)) continue;
      }

      const tentativeG = current.g + 1; // Chebyshev — every step costs 1
      if (maxCells !== undefined && tentativeG > maxCells) continue;
      const prevG = bestG.get(key);
      if (prevG !== undefined && tentativeG >= prevG) continue;

      bestG.set(key, tentativeG);
      const h = chebyshev({ row: nr, col: nc }, goal);
      const f = tentativeG + h;
      const newNode: Node = { row: nr, col: nc, g: tentativeG, f, parent: currentIdx };
      const newIdx = nodes.length;
      nodes.push(newNode);

      // Sorted-insert into open by f ASC.
      let lo = 0, hi = open.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (nodes[open[mid]].f < f) lo = mid + 1;
        else hi = mid;
      }
      open.splice(lo, 0, newIdx);
    }
  }

  // Frontier exhausted — no path.
  return null;
}
