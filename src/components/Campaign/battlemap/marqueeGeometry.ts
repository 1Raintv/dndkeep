// v2.658.0 — Marquee hit-testing, split out of MarqueeLayer.
//
// Pure rect math with NO pixi import, so the tests can load it in a
// bare Node environment. MarqueeLayer.tsx itself imports `pixi.js`,
// which touches `navigator` at module scope; that is fine in a browser
// and fine under Node 21+ (which has a global `navigator`), but CI pins
// Node 20 — so importing the component from a test threw
// "ReferenceError: navigator is not defined" there while passing on a
// dev machine. Same separation `coverState.ts` already uses.
//
// Footprint rather than centre point is deliberate throughout: clipping
// the corner of a Gargantuan dragon should select it, and a centre test
// would make big creatures feel unselectable.

import type { Token } from '../../../lib/map/mapTypes';
import { tokenSizeCells } from '../../../lib/map/coords';

export interface WorldRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Normalise a dragged rect so x1<x2 and y1<y2 whichever way it was swept. */
export function normaliseRect(r: WorldRect): WorldRect {
  return {
    x1: Math.min(r.x1, r.x2),
    y1: Math.min(r.y1, r.y2),
    x2: Math.max(r.x1, r.x2),
    y2: Math.max(r.y1, r.y2),
  };
}

/**
 * World-space bounding box of a token's footprint.
 *
 * Mirrors the anchor convention in src/lib/map/coords.ts: odd
 * footprints (1×1, 3×3) anchor at their centre cell's centre, even
 * ones (2×2, 4×4) at the footprint's top-left grid intersection.
 */
export function tokenBoundsWorld(t: Token, cellSize: number): WorldRect {
  const cells = tokenSizeCells(t.size);
  const span = cells * cellSize;
  if (cells % 2 === 1) {
    const half = span / 2;
    return { x1: t.x - half, y1: t.y - half, x2: t.x + half, y2: t.y + half };
  }
  return { x1: t.x, y1: t.y, x2: t.x + span, y2: t.y + span };
}

/** Axis-aligned overlap test; touching edges count as a hit. */
export function rectsOverlap(a: WorldRect, b: WorldRect): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

/** Ids of every token whose footprint overlaps the swept rectangle. */
export function tokensInRect(
  tokens: Token[],
  rect: WorldRect,
  cellSize: number,
): string[] {
  const norm = normaliseRect(rect);
  return tokens
    .filter(t => rectsOverlap(tokenBoundsWorld(t, cellSize), norm))
    .map(t => t.id);
}

/**
 * True when a world point lands on any token. Used to stand the marquee
 * down so pressing a token drags it instead of sweeping a box.
 *
 * Needed because Pixi's `stopPropagation` is federated-only: Pixi
 * synthesises its events from one DOM listener on the canvas, so
 * stopping propagation inside Pixi's own graph does nothing to other
 * DOM listeners on that same canvas. A press on a token reached the
 * marquee anyway, and dragging a goblin swept a selection box with it.
 */
export function pointHitsToken(
  tokens: Token[],
  x: number,
  y: number,
  cellSize: number,
): boolean {
  return tokens.some(t => {
    const b = tokenBoundsWorld(t, cellSize);
    return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
  });
}
