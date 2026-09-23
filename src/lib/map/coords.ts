// v2.566.0 — Track 0 step 3: the three coordinate systems as pure
// functions (see docs/TRACK0_STEP1_RENDERER_INTERFACE.md).
//
//   Grid  (row/col)          — game-logic space; all automation math.
//   World (map-local px)     — renderer-agnostic pixel space.
//   Screen (device px)       — world after pan/zoom; renderer-specific.
//
// Everything up to world space is SHARED between renderers; only
// world↔screen differs per renderer (and even that is a single affine
// transform captured here). Zero React/DOM/Pixi imports — unit-testable.
//
// Token anchor convention (unified v2.455, enforced in
// tokenFootprintRange / tokenFootprintAABBPx):
//   ODD  footprints (1×1, 3×3): anchor (token.x/y) is the CENTER of the
//        center cell — a cell-center point.
//   EVEN footprints (2×2, 4×4): anchor is the TOP-LEFT grid
//        INTERSECTION of the footprint.

import type { TokenSize } from './mapTypes';

export const DEFAULT_GRID_SIZE_PX = 70;

/** Footprint edge length in cells for a token size. */
export function tokenSizeCells(size: TokenSize): number {
  switch (size) {
    case 'tiny': case 'small': case 'medium': return 1;
    case 'large': return 2;
    case 'huge': return 3;
    case 'gargantuan': return 4;
    default: return 1;
  }
}

const TOKEN_SIZES: ReadonlySet<string> = new Set<TokenSize>([
  'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan',
]);

/**
 * v2.657.0 — Normalise any size spelling to a `TokenSize`.
 *
 * The app carries two vocabularies for one idea, differing only in
 * case: `CreatureSize` ('Medium') on species data and monster stat
 * blocks, and `TokenSize` ('medium') on the battle map. Placement code
 * that has a species/creature size in hand needs this to cross over.
 *
 * Unrecognised input falls back to Medium rather than throwing — a bad
 * size string must still place a token, not blank the map.
 */
export function toTokenSize(size: string | null | undefined): TokenSize {
  const key = (size ?? '').trim().toLowerCase();
  return (TOKEN_SIZES.has(key) ? key : 'medium') as TokenSize;
}

// ── Grid → World ─────────────────────────────────────────────────────

/** World coords of the CENTER of cell (row, col). */
export function cellCenterWorld(row: number, col: number, cellSize = DEFAULT_GRID_SIZE_PX) {
  return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

/** World coords of the grid INTERSECTION at (row, col) — the cell's top-left corner. */
export function intersectionWorld(row: number, col: number, cellSize = DEFAULT_GRID_SIZE_PX) {
  return { x: col * cellSize, y: row * cellSize };
}

/** Canonical anchor world position for a token at (row, col) of a given
 *  size — cell center for odd footprints, top-left intersection for even. */
export function tokenAnchorWorld(row: number, col: number, size: TokenSize, cellSize = DEFAULT_GRID_SIZE_PX) {
  return tokenSizeCells(size) % 2 === 1
    ? cellCenterWorld(row, col, cellSize)
    : intersectionWorld(row, col, cellSize);
}

// ── World → Grid ─────────────────────────────────────────────────────

/** Cell (row, col) containing a world point. */
export function worldToCell(worldX: number, worldY: number, cellSize = DEFAULT_GRID_SIZE_PX) {
  return { row: Math.floor(worldY / cellSize), col: Math.floor(worldX / cellSize) };
}

// ── World-space snapping (moved verbatim from BattleMapV2.tsx) ───────

export function snapToCellCenter(worldX: number, worldY: number, cellSize = DEFAULT_GRID_SIZE_PX) {
  // v2.400.0 — Round-to-nearest cell. Default snap target is the
  // nearest cell center (works correctly for 1×1 / 3×3 tokens
  // whose anchor is at a cell center). For 2×2 / 4×4 tokens the
  // caller should use snapTokenAnchor(x, y, size, cellSize) which
  // dispatches to grid-intersection snap.
  const col = Math.round((worldX - cellSize / 2) / cellSize);
  const row = Math.round((worldY - cellSize / 2) / cellSize);
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

// v2.746.0 — Nudge the rounding quotient so an anchor sitting EXACTLY on
// a cell boundary tie-breaks the same way on both axes. viewport.toWorld
// returns float noise around a whole number (…279.99999997 vs
// 280.00000003), so a corner drop at (420,280) could round x DOWN and y
// UP → (385,315) instead of (455,315): the preview marker (computed from
// the previous pointermove) and the committed cell disagreed by one cell
// on one axis, which the user saw as a sideways hop after release.
// 1e-6 cells (7e-5 px at 70px cells) is far below anything a pointer can
// produce on purpose and far above float noise.
const SNAP_EPSILON = 1e-6;

/**
 * v2.401.0 — Size-aware snap. The token's anchor coordinate is the
 * geometric center of its footprint:
 *   1×1 / 3×3 (odd sizes) → footprint center is a CELL CENTER
 *   2×2 / 4×4 (even sizes) → footprint center is a GRID INTERSECTION
 * (History and the bug it fixed: see BattleMapV2's v2.401 ship note.)
 */
export function snapTokenAnchor(
  worldX: number,
  worldY: number,
  size: TokenSize,
  cellSize = DEFAULT_GRID_SIZE_PX,
): { x: number; y: number } {
  if (tokenSizeCells(size) % 2 === 1) {
    // Odd sizes: snap to cell centers. (Cell N center at (N+0.5)*cellSize.)
    const col = Math.round((worldX - cellSize / 2) / cellSize + SNAP_EPSILON);
    const row = Math.round((worldY - cellSize / 2) / cellSize + SNAP_EPSILON);
    return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
  }
  // Even sizes: snap to grid intersections. (Intersection N at N*cellSize.)
  const col = Math.round(worldX / cellSize + SNAP_EPSILON);
  const row = Math.round(worldY / cellSize + SNAP_EPSILON);
  return { x: col * cellSize, y: row * cellSize };
}

/**
 * v2.746.0 — The ONE drop target for a token: size-aware snap PLUS the
 * footprint clamp that keeps the whole token on the map.
 *
 * Why one helper: the drag preview marker (TokenLayer.drawPreview), the
 * pointerup commit, the peer broadcast and click-to-move each carried a
 * verbatim copy of "snapTokenAnchor + clamp". Any drift between them —
 * and there was some: the commit re-derived the cell from the pointerup
 * event while the marker used the last rAF-coalesced pointermove — shows
 * up to the user as "the token shifts a little after I let go". The
 * invariant this module enforces is: what the preview shows is what
 * lands, on every screen. Callers pass the raw anchor (cursor − grab
 * offset) and get back the exact anchor to display, broadcast and save.
 *
 * Clamp rules (v2.432): odd footprints anchor at the centre cell so the
 * visual extends footPx/2 each way → anchor ∈ [footPx/2, W − footPx/2];
 * even footprints anchor at the top-left intersection so the visual
 * extends footPx to the south-east → anchor ∈ [0, W − footPx]. (User
 * report that motivated the clamp: a 4×4 dragon dropped at (2100,1400)
 * on a 2100×1400 world had every cell off the map.)
 */
export function snapTokenDrop(
  worldX: number,
  worldY: number,
  size: TokenSize,
  cellSize: number,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  const snapped = snapTokenAnchor(worldX, worldY, size, cellSize);
  const cells = tokenSizeCells(size);
  const footPx = cells * cellSize;
  const even = cells % 2 === 0;
  const min = even ? 0 : footPx / 2;
  const maxX = even ? worldWidth - footPx : worldWidth - footPx / 2;
  const maxY = even ? worldHeight - footPx : worldHeight - footPx / 2;
  return {
    x: Math.max(min, Math.min(maxX, snapped.x)),
    y: Math.max(min, Math.min(maxY, snapped.y)),
  };
}

// ── World ↔ Screen ───────────────────────────────────────────────────
// The renderer-specific part, captured as one affine transform. A
// viewport is {offsetX, offsetY, scale}: screen = world * scale + offset.

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function worldToScreen(worldX: number, worldY: number, v: ViewTransform) {
  return { x: worldX * v.scale + v.offsetX, y: worldY * v.scale + v.offsetY };
}

export function screenToWorld(screenX: number, screenY: number, v: ViewTransform) {
  return { x: (screenX - v.offsetX) / v.scale, y: (screenY - v.offsetY) / v.scale };
}
