// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.
// Constants + pure geometry helpers shared by the battlemap layers and
// the BattleMapV2 root.

import type { TokenSize } from '../../../lib/stores/battleMapStore';

export const DEFAULT_GRID_SIZE_PX = 70;
export const DEFAULT_WIDTH_CELLS = 30;
export const DEFAULT_HEIGHT_CELLS = 20;

export const BG_COLOR = 0x0f1012;
export const GRID_MINOR_COLOR = 0x2a2d31;
export const GRID_MAJOR_COLOR = 0x404449;
export const GRID_EDGE_COLOR = 0x6b7280;

export const TOKEN_COLORS = [
  0xa78bfa, // purple (the app's accent)
  0x60a5fa, // blue
  0xf87171, // red
  0x34d399, // green
  0xfbbf24, // yellow
  0xf472b6, // pink
] as const;

// v2.227 — D&D 5e 2024 PHB conditions list + per-condition palette,
// mirrored from src/components/Campaign/BattleMap.tsx so v2's token
// quick panel renders the same color-coded chips. Source of truth
// for cascade rules + advantage/disadvantage state remains
// src/lib/conditions.ts and src/data/conditions.ts; this constant is
// just for UI labelling. Note: Exhaustion is shown as a single chip
// here (matches v1 UX); real Exhaustion is leveled 1–6 and is best
// adjusted on the full character sheet.
export const ALL_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened',
  'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
  'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;
export const COND_COLOR: Record<string, string> = {
  Blinded: '#94a3b8', Charmed: '#f472b6', Deafened: '#78716c', Exhaustion: '#a78bfa',
  Frightened: '#fb923c', Grappled: '#84cc16', Incapacitated: '#f87171', Invisible: '#60a5fa',
  Paralyzed: '#e879f9', Petrified: '#6b7280', Poisoned: '#4ade80', Prone: '#fbbf24',
  Restrained: '#f97316', Stunned: '#c084fc', Unconscious: '#ef4444',
};

// v2.244 — single-glyph icon per condition, used by the canvas token
// strip. Glyphs are intentionally simple ASCII/symbol so they render
// crisp at small sizes across browsers without needing an emoji font.
// Conditions not in this map are skipped on the strip (they still
// surface as chips in the quick panel). Numeric mirror of COND_COLOR
// for the Pixi colored circle backing each glyph.
export const COND_ICON: Record<string, string> = {
  Stunned: 'S', Poisoned: 'P', Frightened: 'F', Prone: 'D',
  Blinded: 'B', Charmed: 'C', Deafened: 'd', Exhaustion: 'X',
  Grappled: 'G', Incapacitated: 'I', Invisible: 'i', Paralyzed: 'p',
  Petrified: 'r', Restrained: 'R', Unconscious: 'U',
};
export const COND_COLOR_HEX: Record<string, number> = {
  Blinded: 0x94a3b8, Charmed: 0xf472b6, Deafened: 0x78716c, Exhaustion: 0xa78bfa,
  Frightened: 0xfb923c, Grappled: 0x84cc16, Incapacitated: 0xf87171, Invisible: 0x60a5fa,
  Paralyzed: 0xe879f9, Petrified: 0x6b7280, Poisoned: 0x4ade80, Prone: 0xfbbf24,
  Restrained: 0xf97316, Stunned: 0xc084fc, Unconscious: 0xef4444,
};

export const SIZE_OPTIONS: readonly TokenSize[] = [
  'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan',
];

export function tokenRadiusForSize(size: TokenSize, cellSize: number): number {
  // v2.398.0 — Visual circle is inscribed in the FULL footprint
  // square (size×size cells), not the historical padded cellSpan.
  // User feedback on Ancient Red Dragon: "the icon needs to be
  // the entire square instead of one square" — i.e. for a Large+
  // creature, the visible token should fill its size×size grid
  // area, not bulge out of just the anchor cell.
  //
  // Old cellSpan values (kept here for reference): tiny 0.4,
  // small 0.85, medium 0.85, large 1.85, huge 2.85, gargantuan 3.85.
  // Those padded the circle slightly inside an N×N grid for breathing
  // room. The new convention drops the padding so a Large dragon
  // visually occupies its full 2x2 area, etc.
  //
  // Tiny stays smaller-than-cell for visual distinction (a goblin
  // token shouldn't fill its cell — that's a Medium creature).
  const cellSpan: Record<TokenSize, number> = {
    tiny: 0.5,
    small: 0.95, medium: 0.95,
    large: 2, huge: 3, gargantuan: 4,
  };
  return (cellSpan[size] * cellSize) / 2;
}

/**
 * v2.397.0 — Footprint cell-count for a token size, per RAW 5e:
 *   tiny / small / medium → 1
 *   large                  → 2
 *   huge                   → 3
 *   gargantuan             → 4
 *
 * Distinct from `tokenRadiusForSize`'s cellSpan values — those are
 * visual (0.85 etc. for breathing room around the circle). This
 * function gives the integer cells the creature *occupies* on the
 * grid for purposes of click-area and reach math.
 *
 * Mirrors the SIZE_TO_CELLS map in src/lib/battleMapGeometry.ts; if
 * you change one, change both.
 */
export function tokenFootprintCells(size: TokenSize): number {
  switch (size) {
    case 'tiny': case 'small': case 'medium': return 1;
    case 'large': return 2;
    case 'huge': return 3;
    case 'gargantuan': return 4;
    default: return 1;
  }
}

export function tokenInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const match = trimmed.match(/^([A-Za-z])([^A-Za-z]*\d)?/);
  if (match) {
    const firstChar = match[1].toUpperCase();
    const digitGroup = (match[2] ?? '').replace(/\D/g, '');
    if (digitGroup) return (firstChar + digitGroup[0]).slice(0, 2);
    return firstChar;
  }
  return trimmed.slice(0, 2).toUpperCase();
}

// v2.566.0 — Track 0 step 3: snapToCellCenter / snapTokenAnchor moved
// verbatim to src/lib/map/coords.ts (pure, renderer-agnostic, unit-
// testable). Imported for the call sites below and re-exported so any

export interface ContextMenuState {
  tokenId: string;
  clientX: number;
  clientY: number;
}

/** Snap world coords to the nearest cell corner. v2.210 exports
 *  snapToGrid which already does this (unlike snapToCellCenter).
 *  Using a dedicated alias here keeps call-sites self-documenting. */
export function snapToGridCorner(x: number, y: number, cellSize: number): { x: number; y: number } {
  return {
    x: Math.round(x / cellSize) * cellSize,
    y: Math.round(y / cellSize) * cellSize,
  };
}

/** Perpendicular distance from point (px, py) to line segment
 *  (x1, y1)-(x2, y2). Used for wall hit-detection during delete. */
export function pointSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) {
    // Degenerate segment (should never happen for walls but defensive)
    const ddx = px - x1;
    const ddy = py - y1;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  // Clamp t to [0,1] so we measure to the segment, not the infinite line.
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}
