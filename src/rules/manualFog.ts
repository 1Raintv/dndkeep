// v2.664.0 — Manual fog: the DM paints which cells are revealed.
//
// Pure cell-set arithmetic, no renderer and no DB. The brush geometry
// lives here rather than in the Pixi layer for the reason the whole
// battle-map decomposition exists: a test that imports a battlemap
// component passes locally and fails CI on node 20, because pixi reads
// a global `navigator` at module scope.

/** A grid cell. Row is Y (top-down), col is X (left-right). */
export interface FogCell {
  row: number;
  col: number;
}

/** Storage shape: `[row, col]` pairs, matching scenes.revealed_cells. */
export type FogCellPair = [number, number];

/** Stable key for set membership. */
export function fogCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Parse `scenes.revealed_cells` into a Set of keys.
 *
 * Defensive on purpose: this value is JSON from the database and, in
 * manual mode, it is the *only* thing standing between players and the
 * whole map. A malformed entry should cost one cell, never the fog.
 */
export function parseRevealedCells(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [r, c] = entry;
    if (typeof r !== 'number' || typeof c !== 'number') continue;
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    out.add(fogCellKey(Math.trunc(r), Math.trunc(c)));
  }
  return out;
}

/** Serialise back to the storage shape, sorted so diffs stay readable. */
export function serialiseRevealedCells(keys: ReadonlySet<string>): FogCellPair[] {
  return [...keys]
    .map(k => k.split(',').map(Number) as FogCellPair)
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
}

/**
 * Cells a circular brush of `radiusCells` covers, centred on a cell.
 *
 * Radius 0 paints exactly one cell; radius 1 a full 3x3; radius 2 and up
 * round off at the corners. The half-cell tolerance below is what makes
 * radius 1 a square rather than a 5-cell plus — the smallest usable
 * brush should not be a fiddly cross — while still excluding the corners
 * once the circle is big enough for the difference to read.
 *
 * Clamped to the grid so a stroke off the edge cannot store cells that
 * no longer exist if the map is later resized.
 */
export function brushCells(
  centre: FogCell,
  radiusCells: number,
  widthCells: number,
  heightCells: number,
): FogCell[] {
  const out: FogCell[] = [];
  const r = Math.max(0, Math.floor(radiusCells));
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      // <= r + 0.5 so the cardinal cells at exactly distance r are in;
      // a strict `<= r` clips them and the brush reads as a diamond.
      if (Math.hypot(dr, dc) > r + 0.5) continue;
      const row = centre.row + dr;
      const col = centre.col + dc;
      if (row < 0 || col < 0 || row >= heightCells || col >= widthCells) continue;
      out.push({ row, col });
    }
  }
  return out;
}

/**
 * v2.667.0 — every cell in the inclusive rectangle between two corners.
 *
 * The round brush is the wrong tool for the shape most maps are made of:
 * revealing a rectangular room with it means scrubbing the corners and
 * still catching a cell of the corridor outside. Drag one diagonal
 * instead and the room lands in a single stroke.
 *
 * Both corners are INCLUSIVE, so a click that never moves reveals
 * exactly the cell under the cursor — a rectangle tool that needs a drag
 * to do anything reads as broken on the first click.
 *
 * Clamped to the grid, same as `brushCells` and for the same reason: a
 * drag off the edge must not store cells that stop existing if the map
 * is later resized.
 */
export function rectCells(
  a: FogCell,
  b: FogCell,
  widthCells: number,
  heightCells: number,
): FogCell[] {
  const out: FogCell[] = [];
  const rowFrom = Math.max(0, Math.min(a.row, b.row));
  const rowTo = Math.min(heightCells - 1, Math.max(a.row, b.row));
  const colFrom = Math.max(0, Math.min(a.col, b.col));
  const colTo = Math.min(widthCells - 1, Math.max(a.col, b.col));
  for (let row = rowFrom; row <= rowTo; row++) {
    for (let col = colFrom; col <= colTo; col++) out.push({ row, col });
  }
  return out;
}

/**
 * Apply a brush stroke. `reveal: false` is the eraser.
 *
 * Returns a NEW set, and returns the original untouched when nothing
 * changed — the caller uses that identity check to skip a database
 * write, which matters because painting fires this per pointer-move.
 */
export function applyBrush(
  current: ReadonlySet<string>,
  cells: readonly FogCell[],
  reveal: boolean,
): Set<string> | ReadonlySet<string> {
  let changed = false;
  const next = new Set(current);
  for (const { row, col } of cells) {
    const key = fogCellKey(row, col);
    if (reveal) {
      if (!next.has(key)) { next.add(key); changed = true; }
    } else if (next.delete(key)) {
      changed = true;
    }
  }
  return changed ? next : current;
}

/** World-pixel point → grid cell. */
export function cellAtPoint(x: number, y: number, gridSizePx: number): FogCell {
  return {
    row: Math.floor(y / gridSizePx),
    col: Math.floor(x / gridSizePx),
  };
}
