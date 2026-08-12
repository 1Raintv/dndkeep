// v2.652.0 — Per-token cover state for the battle map.
//
// The attack modals derive cover for ONE line of effect at declare time
// (see battleMapGeometry.deriveCover). This module answers the map's
// question instead: "for every token on screen, does it currently have
// cover, and from what?" — which is what the shield glyph on the token
// and the player's take-cover chip both render.
//
// Deliberately importing only from src/rules/cover + src/lib/map/coords,
// never battleMapGeometry: that module reaches for supabase, and this
// runs inside the render path on every token move.

import type { Token, Wall } from '../../../lib/map/mapTypes';
import { tokenSizeCells } from '../../../lib/map/coords';
import {
  findNearbyCoverBlockers,
  summariseCoverAgainstThreats,
  toSizeKey,
  type CellRect,
  type CoverBlocker,
  type CoverLevel,
  type CoverThreat,
  type CoverWall,
  type GridCell,
} from '../../../rules/cover';

export interface TokenCoverState {
  /** Best cover this token currently has against any single threat. */
  level: CoverLevel;
  /** Names of the creatures providing it, for the tooltip / chip. */
  from: string[];
  /** How many live threats it applies against… */
  againstCount: number;
  /** …out of this many live threats (see LIVE THREATS below). */
  threatCount: number;
}

/**
 * Anchor cell of a token. Works for both anchor conventions because
 * either way the anchor point lands inside its own cell: odd footprints
 * sit at a cell centre, even ones at the top-left intersection of the
 * footprint (see src/lib/map/coords.ts).
 */
export function tokenCell(t: Token, cellSize: number): GridCell {
  return {
    row: Math.floor(t.y / cellSize),
    col: Math.floor(t.x / cellSize),
  };
}

/**
 * Inclusive cell range a token occupies. Mirrors
 * battleMapGeometry.tokenFootprintRange: odd footprints grow outward
 * from the centre cell, even ones extend right and down from the anchor.
 */
export function tokenCellRect(t: Token, cellSize: number): CellRect {
  const { row, col } = tokenCell(t, cellSize);
  const s = tokenSizeCells(t.size);
  if (s % 2 === 1) {
    const half = Math.floor(s / 2);
    return { rMin: row - half, rMax: row + half, cMin: col - half, cMax: col + half };
  }
  return { rMin: row, rMax: row + s - 1, cMin: col, cMax: col + s - 1 };
}

export function tokenToBlocker(t: Token, cellSize: number): CoverBlocker {
  return {
    id: t.id,
    name: t.name,
    size: toSizeKey(t.size),
    footprint: tokenCellRect(t, cellSize),
  };
}

/**
 * Party-level allegiance heuristic: a token linked to a player
 * character is on the party's side, everything else opposes it.
 *
 * DNDKeep has no faction model — DeclareAttackModal's friendly-fire
 * warning (v2.105) makes exactly the same assumption. The visible
 * consequence is that a DM-placed neutral token counts as a threat to
 * the party, so a PC standing behind an ally near a shopkeeper shows a
 * cover badge. Harmless: the badge is informational, and every number
 * that reaches a die roll is still derived per-attack from the real
 * attacker.
 */
export function isPartyToken(t: Token): boolean {
  return !!t.characterId;
}

/**
 * Walls that can contribute cover. Open doors are skipped, matching
 * VisionLayer (v2.271) and wallCollision.
 */
export function coverWalls(walls: Wall[]): CoverWall[] {
  return walls.filter(w => w.blocksSight && w.doorState !== 'open');
}

/**
 * Cover state for every token that has any, keyed by token id. Tokens
 * with no cover — and tokens with no opposition on the map at all —
 * are simply absent, so the renderer can treat presence as "draw the
 * glyph".
 *
 * TWO RULES keep this a signal rather than wallpaper. Both were added
 * after v2.652's first build put a badge on all 13 tokens of the local
 * fixture, most of them a red "total cover":
 *
 *  1. LIVE THREATS ONLY. A threat already behind TOTAL cover can't
 *     target you at all, so "you have cover from it" is not news — it's
 *     in another room. Those threats are skipped entirely, and don't
 *     count toward `threatCount`. Without this, every token in a
 *     walled map has total cover from everyone in every other room.
 *
 *  2. CREATURE-DERIVED ONLY. The badge reports bodies in the way, not
 *     masonry. Walls still feed the real numbers at attack time
 *     (unchanged, in DeclareAttackModal) — but they can't feed an
 *     honest badge yet, because `wall_type` is unpopulated, so every
 *     wall scores the legacy 1 point and any three stacked walls read
 *     as "total". Wall-derived badges arrive with the queued wall
 *     typing work (docs/ROADMAP.md, Track 2).
 *
 * Cost is O(tokens × threats) line tests; with a typical 10-25 token
 * scene that is a few thousand segment intersections, cheap enough to
 * recompute in a useMemo whenever tokens or walls change.
 */
export function buildTokenCoverMap(
  tokens: Token[],
  walls: Wall[],
  cellSize: number,
): Map<string, TokenCoverState> {
  const result = new Map<string, TokenCoverState>();
  if (tokens.length < 2) return result;

  const usableWalls = coverWalls(walls);
  const blockers = tokens.map(t => tokenToBlocker(t, cellSize));
  const cells = new Map(tokens.map(t => [t.id, tokenCell(t, cellSize)]));

  for (const token of tokens) {
    const self = cells.get(token.id);
    if (!self) continue;
    const threats = tokens.filter(o => isPartyToken(o) !== isPartyToken(token));
    if (threats.length === 0) continue;

    const summary = summariseCoverAgainstThreats(
      self,
      token.size,
      threats.flatMap<CoverThreat>(t => {
        const cell = cells.get(t.id);
        return cell ? [{ id: t.id, name: t.name, cell }] : [];
      }),
      usableWalls,
      blockers,
      cellSize,
    );

    if (summary.level === 'none') continue;
    result.set(token.id, {
      level: summary.level,
      from: summary.blockerNames,
      againstCount: summary.coveredFrom.length,
      threatCount: summary.liveThreats,
    });
  }

  return result;
}

/**
 * Creatures adjacent to `token` that it could duck behind — the "is
 * there anything here at all?" question the player-facing chip asks
 * before doing any per-threat work. Returns names, since that is all
 * the chip shows.
 */
export function nearbyCoverNames(
  token: Token,
  tokens: Token[],
  cellSize: number,
): string[] {
  const others = tokens
    .filter(t => t.id !== token.id)
    .map(t => tokenToBlocker(t, cellSize));
  return findNearbyCoverBlockers(tokenCellRect(token, cellSize), token.size, others)
    .map(b => b.name)
    .filter((n): n is string => !!n);
}
