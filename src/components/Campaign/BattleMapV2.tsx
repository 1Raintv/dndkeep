// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell.
// v2.209.0 — Phase Q.1 pt 2: PixiJS Application mounted.
// v2.210.0 — Phase Q.1 pt 3: pixi-viewport + square grid + snap helper.
// v2.211.0 — Phase Q.1 pt 4: Zustand store + first draggable token.
// v2.212.0 — Phase Q.1 pt 5: multi-token + initials + "Add Token" + context menu.
// v2.213.0 — Phase Q.1 pt 6: scene persistence — scene picker, DB hydration.
// v2.214.0 — Phase Q.1 pt 7: Realtime multiplayer sync via Postgres Changes.
// v2.215.0 — Phase Q.1 pt 8: portrait upload + Pixi Sprite rendering.
// v2.216.0 — Phase Q.1 pt 9: live drag previews + drag-locks via Broadcast+Presence.
// v2.217.0 — Phase Q.1 pt 10: scene background image upload + render.
// v2.218.0 — Phase Q.1 pt 11: Measurement tool (ruler).
// v2.219.0 — Phase Q.1 pt 12: Scene settings modal. DM can rename a
// scene, adjust grid size and width/height in cells, toggle published
// state, delete the scene, or auto-fit dimensions to an uploaded map
// image's aspect. All changes propagate via the v2.214 scenes
// Realtime channel so players see updates instantly.
// v2.220.0 — Phase Q.1 pt 13: "+ Add PC Tokens" button. Bulk-creates
// tokens for every player character in the campaign that doesn't
// already have one in the current scene (linked by character_id).
// Idempotent re-click. Tokens commit to DB and propagate via
// Realtime so all players see their party appear at once.
// v2.221.0 — Phase Q.1 pt 14: Live HP bar on tokens linked to a
// player character. Color-graded (green/yellow/red/gray) bar pinned
// below the token. Updates whenever the parent's playerCharacters
// prop changes (i.e. whenever a character's HP updates anywhere in
// the app). No DB or realtime additions; pure derived rendering.
// v2.222.0 — Phase Q.1 pt 15: "View Character Sheet" right-click
// action on linked tokens. Token context menu gets a navigate-jump
// to the linked character's full sheet via the existing
// /character/:id route. Tiny ship; massive DM utility during prep.
// v2.223.0 — Phase Q.1 pt 16 (Phase 3 begin): scene_walls schema +
// click-to-place wall drawing tool + static WallLayer rendering.
// Walls are line segments between cell corners. DM-only drawing
// (RLS-enforced). Chain mode: each click sets a new start so DMs
// can rapidly lay down connected segments. Right-click within wall
// mode deletes the nearest wall. Escape cancels a pending start.
// Realtime sync via Postgres Changes on scene_walls. v2.224 will
// consume these walls to clip per-token visibility polygons; v2.225
// adds per-player fog of war.
// v2.224.0 — Phase Q.1 pt 17 (Phase 3 cont): VisionLayer.
// Walls now BLOCK SIGHT. Each PC token contributes a visibility
// polygon computed by raycast (180 rays, ~2° resolution) clipped by
// walls with blocks_sight=true. Polygons render with 'erase' blend
// mode against a world-spanning dark fog Graphics, all rasterized to
// a RenderTexture and displayed as a Sprite over the scene. DM sees
// no fog; players see fog with party-shared sight (every PC token
// contributes vision). Vision range hardcoded 60ft for v2.224 —
// v2.226 will read per-character darkvision/normal-vision.
// v2.225.0 — HOTFIX: ViewportHost effect dep-array bug. The effect
// that creates the Pixi Viewport and adds it to the stage was missing
// `app` from its dependency list. Pixi v8's Application init is async,
// so first render returns app:null → effect bails early → effect never
// re-fires when init completes → stage stays empty → canvas renders
// pure black. Symptom: v2 map area completely blank for everyone.
// Fix: depend on the Pixi app + `isInitialised` flag, gate viewport
// creation on `isReady`. Latent bug since v2.210; v2.224's heavier
// component tree pushed initial render order such that the bug became
// reliable. No feature changes in this ship.
// v2.226.0 — Phase Q.1 pt 18: visual polish + token quick panel.
//   1. Top-right zoom buttons now have strong contrast (white text,
//      dark fill, halo shadow) so they read clearly over busy map
//      backgrounds.
//   2. Token name labels render below each token in Pixi (white bold
//      with dark stroke) — DMs can read which token is which without
//      relying on initials alone.
//   3. Default zoom is 1.0× fit (was 0.9×) so tokens read at usable
//      size out of the box.
//   4. Left-click (without drag) on a PC token opens TokenQuickPanel:
//      avatar/name/class/level header + HP bar + AC + Speed + 6-stat
//      mod grid + read-only conditions + DM damage/heal/set HP
//      controls + "Open Character Sheet" link. Closes on Escape or
//      backdrop click. Click vs drag is detected via a screen-space
//      5px movement threshold + 250ms time window.
// v2.227.0 — Phase Q.1 pt 19: condition apply/remove on the panel.
//   - Active condition chips are now interactive (DM only): click ✕
//     to remove. Color-coded via COND_COLOR matching v1's palette.
//   - New "Apply Condition" picker section under DM Controls lists
//     every 5e 2024 PHB condition not already on the character;
//     click → apply.
//   - Both flows write directly to characters.active_conditions
//     (same path v1 uses). Realtime UPDATE on characters table
//     propagates back to the panel and to character sheets.
//   - condBusy flag gates all writes to prevent double-click races.
//   - Cascades (Unconscious → Prone + Incapacitated, etc.) are NOT
//     applied here; same trade-off v1 makes. The cascade pipeline
//     in src/lib/conditions.ts requires a combat_participants row
//     and is reserved for encounter-driven condition changes.
// v2.228.0 — Phase Q.1 pt 20: DM action toolbar separation.
//   - Map / Tokens action buttons (Change Map, Remove Map, + Add PC
//     Tokens, + Add Token) moved out of the in-canvas top-right
//     overlay into a dedicated solid bar above the canvas. They were
//     near-unreadable as semi-transparent cards over busy map
//     backgrounds.
//   - The new bar uses var(--c-card) background + visible borders +
//     small section labels ("Map", "Tokens") + a divider for clarity.
//   - The Scene-name badge (top-left of canvas) and the zoom + ruler
//     + walls toolbars stay on the canvas — they're contextual to
//     the map itself.
//   - No behavior changes; pure layout refactor. Canvas dims and all
//     overlays remain the same.
// v2.229.0 — Phase Q.1 pt 21: ChecksPanel on TokenQuickPanel.
//   - Extracted ChecksPanel from PartyDashboard.tsx into its own file
//     (src/components/Campaign/ChecksPanel.tsx) so the same UI can be
//     reused on the BattleMapV2 token quick panel. PartyDashboard now
//     imports it; behavior on the Party tab is unchanged.
//   - DM clicking a player token on the map now sees the same checks
//     surface they get on the Party tab: skill picker, raw ability
//     buttons, save buttons, advantage/disadvantage/DC controls,
//     "Roll Secret" + "Prompt Player" actions, last-result strip.
//   - Required widening the playerCharacters prop on BattleMapV2 with
//     saving_throw_proficiencies, skill_proficiencies, skill_expertises
//     so checkModifier() can compute per-skill bonuses without an
//     extra fetch. CampaignDashboard now passes these through.
//   - Required adding a campaignId prop to TokenQuickPanel so
//     "Prompt Player" can route the campaign_chat insert correctly.
//   - Panel max-height bumped 380 → 600 so the panel doesn't scroll
//     immediately on a tall character record. overflow:auto still
//     handles the rare case of conditions + checks both being full.
//   - Cast slim-character → Character at the ChecksPanel boundary
//     (rollCheck/checkModifier only read the fields we already pass).
// v2.231.0 — Phase Q.1 pt 22: Initiative bar + Party Vitals strip.
//   - InitiativeBar: slim horizontal strip rendered above the canvas
//     wrapper when sessionState.combat_active is true. Shows
//     "Round N" + each combatant as a chip in initiative order with
//     init number, name, HP. Active combatant is gold-bordered and
//     scaled up. PCs get blue accents, monsters red. DM gets a
//     "Next Turn →" button that wraps + bumps round at end of order.
//     Hidden when combat isn't active so the map isn't crowded.
//   - PartyVitalsBar: always-on horizontal strip below the canvas
//     wrapper. Lists every PC in the campaign as a compact card with
//     name + AC chip + HP bar (color-graded green/yellow/red) +
//     spell-slot pips per level (filled = remaining). Read-only;
//     edits go through TokenQuickPanel or the player's own sheet.
//     Hides itself if no PCs (e.g. a campaign-creation moment).
//   - Plumbing: CampaignDashboard now passes sessionState +
//     onUpdateSession + spell_slots through to BattleMapV2. Both
//     props are optional so older callers still compile.
//   - No schema changes; both bars read existing data flowing through
//     CampaignDashboard's Realtime subscriptions.
//   Deferred to v2.232+:
//      - Enemy attack flow (range highlight → target picker → roll
//        pipeline → reaction prompt → damage application).
//      - NPC token roster + bulk add.
//      - Combat-aware condition cascades.
//      - Lighting / fog of war fix.
//      - Click a vitals card to focus its token on the map (camera
//        pan/zoom). Currently the strip is purely informational.

import { Application, extend, useApplication } from '@pixi/react';
import { Assets, ColorMatrixFilter, Container, FederatedPointerEvent, Graphics, Rectangle, RenderTexture, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useBattleMapStore, type Token, type TokenSize, type Wall, type SceneText, type SceneDrawing, type DrawingKind } from '../../lib/stores/battleMapStore';
import * as scenesApi from '../../lib/api/scenes';
// v2.313: tokens now route through the API router so the BattleMap
// can swap between scene_tokens (legacy) and scene_token_placements
// (new combatants+placements path) based on the per-campaign
// use_combatants_for_battlemap flag. The router exposes the same
// surface as the old sceneTokens import, so existing call sites work
// unchanged. See docs/COMBAT_PHASE_3_TOKEN_LIBRARY.md.
import * as tokensApi from '../../lib/api/tokensApiRouter';
import { setUseCombatantsPath } from '../../lib/api/tokensApiRouter';
import { getUseCombatantsFlag } from '../../lib/api/scenePlacements';
import * as wallsApi from '../../lib/api/sceneWalls';
import * as textsApi from '../../lib/api/sceneTexts';
import * as drawingsApi from '../../lib/api/sceneDrawings';
import { computeVisibilityPolygon, type WallSegment } from '../../lib/vision/visibilityPolygon';
import { segmentBlockedByWall } from '../../lib/wallCollision';
// dbRowToToken is the legacy realtime mapper — used only on the
// legacy branch of the subscription effect. The new path re-fetches
// the JOINed placement+combatant row instead.
import { dbRowToToken } from '../../lib/api/sceneTokens';
import * as assetsApi from '../../lib/api/battleMapAssets';
import { supabase } from '../../lib/supabase';
// v2.229 — shared Checks UI; used by the TokenQuickPanel for DM-clicked
// player tokens. Same component PartyDashboard renders on the Party tab.
import ChecksPanel from './ChecksPanel';
import type { Character } from '../../types';
import { useToast } from '../shared/Toast';
import { useUndoRedo } from '../../lib/hooks/useUndoRedo';
import { useModal } from '../shared/Modal';
// v2.355.0 — Legacy roster modal imports removed in favor of
// CreaturePickerModal, which sources from the unified NPC tab
// (creature_folders + homebrew_monsters). The old NpcRosterPickerModal
// + NpcRosterBuilderModal pointed at the dropped dm_npc_roster
// table and would 500 on open.
import CreaturePickerModal from './CreaturePickerModal';
import NpcTokenQuickPanel from './NpcTokenQuickPanel';
// v2.355.0 — npcRosterApi + npcsApi imports removed along with the
// legacy addRosterTokens callback in this ship.
// v2.339.0 — BG3 turn UX: read currentActor from CombatContext to drive
// the active-turn outline + movement-remaining badge on the map.
import { useCombat } from '../../context/CombatContext';
// v2.340.0 — BG3 turn UX part 2: movement enforcement on token drag.
// canMove validates the budget before commit; logMovement writes the
// new movement_used_ft + emits the combat event + offers OAs.
// computeChebyshevFt drives the live drag-preview path label.
import { computeChebyshevFt, canMove, logMovement } from '../../lib/movement';
// v2.348.0 — A* pathfinder for click-to-move. Routes around walls +
// occupied cells so the player doesn't have to click each leg of an
// L-shaped corridor.
import { findPath } from '../../lib/pathfinding';
// v2.350.0 — participant-type compat: helper recognizes both the new
// 'creature' value and legacy 'monster'/'npc' values until any
// in-flight realtime data settles.
import { isCreatureParticipantType } from '../../lib/participantType';

extend({ Container, Graphics, Sprite, Text });

interface BattleMapV2Props {
  campaignId: string;
  isDM: boolean;
  userId: string;
  myCharacterId: string | null;
  playerCharacters: Array<{
    id: string;
    name: string;
    class_name: string;
    level: number;
    current_hp: number;
    max_hp: number;
    armor_class: number;
    active_conditions: string[];
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    speed: number;
    // v2.229.0 — proficiency arrays needed by ChecksPanel (skill /
    // ability / save modifiers and "Prompt Player" routing).
    saving_throw_proficiencies?: import('../../types').AbilityKey[];
    skill_proficiencies?: string[];
    skill_expertises?: string[];
    // v2.231.0 — spell slot tally for the Party Vitals strip. Optional
    // because not every campaign sources spell-slot data, and not every
    // character is a caster.
    spell_slots?: import('../../types').SpellSlots;
  }>;
  // v2.296.0 — sessionState/onUpdateSession dropped. session_states
  // table dropped this ship. The "v2.231 initiative tracker bar"
  // referenced below was retired earlier in the unification arc;
  // the modern initiative surface is the bottom InitiativeStrip,
  // which lives outside BattleMapV2 entirely.
  // v2.244.0 — NPC combat state for token visual feedback. Mirrors the
  // playerCharacters pattern but narrower: just what the canvas needs
  // (HP bar + condition icons + dead-state overlay). CampaignDashboard
  // pre-filters by visible_to_players for player viewers, so this list
  // is "everything I'm allowed to see" — no per-token RLS check needed
  // here. Optional so older callers (e.g., test harnesses) still compile.
  npcs?: Array<{
    id: string;
    name: string;
    current_hp: number;
    max_hp: number;
    conditions: string[];
  }>;
  // v2.393.0 — Per-token combat state, keyed by scene_token id. The
  // v2.389 sync trigger reuses scene_tokens.id as combatants.id, so
  // a token's HP/conditions/death state can be looked up by token id
  // alone — no join chain needed. When a token has an entry here, it
  // takes precedence over the legacy npcs[].hp lookup that reads the
  // creature TEMPLATE.
  //
  // Why introduced: pre-v2.393 the map showed identical HP for every
  // instance of the same creature (all goblins shared one HP pool)
  // and combat damage didn't appear on map tokens at all. Per-token
  // state ends both bugs.
  tokenStateMap?: Map<string, {
    current_hp: number | null;
    max_hp: number | null;
    conditions: string[];
    is_dead: boolean;
  }>;
}

// Default scene config used when creating new scenes. v2.214 lets the
// DM pick these at create time.
const DEFAULT_GRID_SIZE_PX = 70;
const DEFAULT_WIDTH_CELLS = 30;
const DEFAULT_HEIGHT_CELLS = 20;

const BG_COLOR = 0x0f1012;
const GRID_MINOR_COLOR = 0x2a2d31;
const GRID_MAJOR_COLOR = 0x404449;
const GRID_EDGE_COLOR = 0x6b7280;

const TOKEN_COLORS = [
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
const ALL_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened',
  'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
  'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;
const COND_COLOR: Record<string, string> = {
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
const COND_ICON: Record<string, string> = {
  Stunned: 'S', Poisoned: 'P', Frightened: 'F', Prone: 'D',
  Blinded: 'B', Charmed: 'C', Deafened: 'd', Exhaustion: 'X',
  Grappled: 'G', Incapacitated: 'I', Invisible: 'i', Paralyzed: 'p',
  Petrified: 'r', Restrained: 'R', Unconscious: 'U',
};
const COND_COLOR_HEX: Record<string, number> = {
  Blinded: 0x94a3b8, Charmed: 0xf472b6, Deafened: 0x78716c, Exhaustion: 0xa78bfa,
  Frightened: 0xfb923c, Grappled: 0x84cc16, Incapacitated: 0xf87171, Invisible: 0x60a5fa,
  Paralyzed: 0xe879f9, Petrified: 0x6b7280, Poisoned: 0x4ade80, Prone: 0xfbbf24,
  Restrained: 0xf97316, Stunned: 0xc084fc, Unconscious: 0xef4444,
};

const SIZE_OPTIONS: readonly TokenSize[] = [
  'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan',
];

function tokenRadiusForSize(size: TokenSize, cellSize: number): number {
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
function tokenFootprintCells(size: TokenSize): number {
  switch (size) {
    case 'tiny': case 'small': case 'medium': return 1;
    case 'large': return 2;
    case 'huge': return 3;
    case 'gargantuan': return 4;
    default: return 1;
  }
}

function tokenInitials(name: string): string {
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

/**
 * v2.401.0 — Size-aware snap. The token's anchor coordinate is the
 * geometric center of its footprint:
 *   1×1 / 3×3 (odd sizes) → footprint center is a CELL CENTER
 *                            (e.g., for 1×1, the cell itself; for
 *                             3×3, the center cell of the 3×3)
 *   2×2 / 4×4 (even sizes) → footprint center is a GRID INTERSECTION
 *                            (no single cell sits at the center)
 *
 * Pre-v2.401 we always snapped to cell-center, which forced even-
 * size tokens to anchor on a cell-center — but then their visual
 * (centered on the anchor) bulged asymmetrically (covering 1
 * up-left + 1 down-right cell instead of being symmetric about
 * the geometric center). Dropping a Large dragon "shifted away"
 * because the snap target didn't match the visual's natural
 * center. This helper picks the right snap target per size.
 */
export function snapTokenAnchor(
  worldX: number,
  worldY: number,
  size: TokenSize,
  cellSize = DEFAULT_GRID_SIZE_PX,
): { x: number; y: number } {
  const cells = (() => {
    switch (size) {
      case 'tiny': case 'small': case 'medium': return 1;
      case 'large': return 2;
      case 'huge': return 3;
      case 'gargantuan': return 4;
      default: return 1;
    }
  })();
  if (cells % 2 === 1) {
    // Odd sizes: snap to cell centers. (Cell N center at (N+0.5)*cellSize.)
    const col = Math.round((worldX - cellSize / 2) / cellSize);
    const row = Math.round((worldY - cellSize / 2) / cellSize);
    return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
  }
  // Even sizes: snap to grid intersections. (Intersection N at N*cellSize.)
  const col = Math.round(worldX / cellSize);
  const row = Math.round(worldY / cellSize);
  return { x: col * cellSize, y: row * cellSize };
}

function ViewportHost(props: {
  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
  children: (viewport: Viewport | null) => ReactNode;
}) {
  const { screenWidth, screenHeight, worldWidth, worldHeight, children } = props;
  const appState = useApplication();
  const [viewport, setViewport] = useState<Viewport | null>(null);

  // v2.225 fix — Pixi v8's Application init is async. useApplication
  // returns an ApplicationState object whose `isInitialised` flag goes
  // true once the renderer is ready. Earlier versions of this effect
  // omitted `appState` from the dep array, which meant the effect ran
  // ONCE at mount with `app.renderer` still undefined → bailed early →
  // never re-fired → viewport never got created → stage stayed empty.
  // Symptom: black canvas, nothing draws. Including appState (and
  // gating on isInitialised) makes the effect re-fire as soon as Pixi
  // is ready.
  const pixiApp = (appState as any)?.app ?? appState;
  const isReady = !!(appState as any)?.isInitialised || !!pixiApp?.renderer;

  useEffect(() => {
    if (!pixiApp || !pixiApp.renderer || !isReady) return;

    const vp = new Viewport({
      screenWidth,
      screenHeight,
      worldWidth,
      worldHeight,
      events: pixiApp.renderer.events,
      passiveWheel: false,
    });
    vp
      .drag({ mouseButtons: 'middle-right' })
      .pinch()
      .wheel({ smooth: 8 })
      .decelerate({ friction: 0.92 })
      .clampZoom({ minScale: 0.25, maxScale: 4 })
      .clamp({ direction: 'all', underflow: 'center' });
    vp.moveCenter(worldWidth / 2, worldHeight / 2);
    // v2.336.0 — P1+P2 fix: default zoom shows the map with breathing
    // room on all sides instead of filling the canvas edge-to-edge.
    //
    // Old behavior: fitScale = the largest zoom that lets the world
    // fit inside the screen. We applied it directly when world > screen.
    // Result: the world filled the canvas edge-to-edge horizontally,
    // and the left-edge tools palette (top:60 left:12) sat ON TOP of
    // map content — the user reported the tools menu felt "lost" and
    // tokens at the map's left edge were obscured.
    //
    // New behavior: 0.80 × fitScale, capped at 1.0 (we never zoom IN
    // past native by default — only out). That gives the viewer:
    //   - ~20% margin around the world on the dominant axis
    //   - The tools palette + zoom badges + scene-name badge all sit
    //     in negative space around the map, not on it
    //   - Room to pan / zoom in while still seeing context near the
    //     map's edges
    //
    // Same math regardless of world or screen size — no special-cases
    // for tiny scenes or huge ones.
    const fitScale = Math.min(screenWidth / worldWidth, screenHeight / worldHeight);
    const initialScale = Math.min(fitScale * 0.80, 1.0);
    vp.setZoom(initialScale, true);

    pixiApp.stage.addChild(vp);
    setViewport(vp);

    return () => {
      if (!vp.destroyed) {
        if (pixiApp.stage && !pixiApp.stage.destroyed) {
          pixiApp.stage.removeChild(vp);
        }
        vp.destroy({ children: true });
      }
      setViewport(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, screenHeight, worldWidth, worldHeight, pixiApp, isReady]);

  return <>{children(viewport)}</>;
}

/**
 * v2.217 — Scene background image layer.
 *
 * When the scene has a backgroundStoragePath, we load the texture and
 * render a Sprite that fills the world (0,0) → (worldWidth, worldHeight).
 * The sprite is the lowest child of the viewport (below grid + tokens),
 * so grid lines and tokens always render on top.
 *
 * Design decisions:
 *  - Stretch-to-world rather than preserving aspect. Rationale: the
 *    DM knows their image's aspect and is expected to configure scene
 *    dimensions to match. v2.218 can add aspect-preserving helpers.
 *  - Texture loads are async via Pixi Assets; we show nothing during
 *    load (grid renders on transparent, which is fine on the dark bg).
 *  - Like TokenLayer's portrait loader, a loadGen counter guards
 *    against stale resolutions when the path changes rapidly.
 *  - On path=null (removed): destroy sprite, no draw.
 */
function BackgroundLayer(props: {
  viewport: Viewport | null;
  backgroundPath: string | null;
  worldWidth: number;
  worldHeight: number;
}) {
  const { viewport, backgroundPath, worldWidth, worldHeight } = props;
  const spriteRef = useRef<Sprite | null>(null);
  const loadGenRef = useRef(0);
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewport) return;

    // If path matches what we already have loaded and world dims
    // changed, just resize in place — avoid a reload.
    if (backgroundPath === currentPathRef.current && spriteRef.current && !spriteRef.current.destroyed) {
      spriteRef.current.width = worldWidth;
      spriteRef.current.height = worldHeight;
      return;
    }

    // Path changed (or first render) — tear down the old sprite.
    loadGenRef.current += 1;
    const thisGen = loadGenRef.current;
    currentPathRef.current = backgroundPath;

    if (spriteRef.current) {
      if (!spriteRef.current.destroyed) {
        viewport.removeChild(spriteRef.current);
        spriteRef.current.destroy();
      }
      spriteRef.current = null;
    }

    if (!backgroundPath) return; // nothing to render

    const url = assetsApi.getSceneBackgroundUrl(backgroundPath);
    if (!url) return;

    Assets.load<Texture>(url).then(texture => {
      if (loadGenRef.current !== thisGen) return;
      if (!viewport || viewport.destroyed) return;

      const sprite = new Sprite(texture);
      sprite.x = 0;
      sprite.y = 0;
      sprite.width = worldWidth;
      sprite.height = worldHeight;
      // v2.217: put background at the LOWEST z-index so grid + tokens
      // render above it. viewport's addChildAt(sprite, 0) inserts at
      // the front of the children array.
      viewport.addChildAt(sprite, 0);
      spriteRef.current = sprite;
    }).catch(err => {
      console.error('[BackgroundLayer] texture load failed', backgroundPath, err);
    });
  }, [viewport, backgroundPath, worldWidth, worldHeight]);

  // Cleanup on unmount or viewport change.
  useEffect(() => {
    return () => {
      if (spriteRef.current && !spriteRef.current.destroyed) {
        spriteRef.current.destroy();
        spriteRef.current = null;
      }
    };
  }, []);

  return null;
}

function GridOverlay(props: {
  viewport: Viewport | null;
  widthCells: number;
  heightCells: number;
  gridSizePx: number;
}) {
  const { viewport, widthCells, heightCells, gridSizePx } = props;
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    viewport.addChild(g);

    const WW = widthCells * gridSizePx;
    const WH = heightCells * gridSizePx;

    g.setStrokeStyle({ color: GRID_EDGE_COLOR, width: 2, alpha: 0.8 });
    g.rect(0, 0, WW, WH);
    g.stroke();

    g.setStrokeStyle({ color: GRID_MINOR_COLOR, width: 1, alpha: 0.6 });
    for (let x = 0; x <= widthCells; x++) {
      const px = x * gridSizePx;
      g.moveTo(px, 0);
      g.lineTo(px, WH);
    }
    for (let y = 0; y <= heightCells; y++) {
      const py = y * gridSizePx;
      g.moveTo(0, py);
      g.lineTo(WW, py);
    }
    g.stroke();

    g.setStrokeStyle({ color: GRID_MAJOR_COLOR, width: 1.5, alpha: 0.9 });
    for (let x = 0; x <= widthCells; x += 5) {
      const px = x * gridSizePx;
      g.moveTo(px, 0);
      g.lineTo(px, WH);
    }
    for (let y = 0; y <= heightCells; y += 5) {
      const py = y * gridSizePx;
      g.moveTo(0, py);
      g.lineTo(WW, py);
    }
    g.stroke();

    return () => {
      if (viewport && !viewport.destroyed) viewport.removeChild(g);
      g.destroy();
    };
  }, [viewport, widthCells, heightCells, gridSizePx]);

  return null;
}

interface ContextMenuState {
  tokenId: string;
  clientX: number;
  clientY: number;
}

/**
 * v2.218 — RulerLayer.
 *
 * When rulerActive is true, a left-click-drag on the canvas draws a
 * measurement line from the start cell to the current cursor cell.
 * A label follows the end point showing "<feet> ft / <cells> cells".
 *
 * Distance model: 2014 D&D 5e PHB uses Chebyshev distance on a square
 * grid (diagonal moves cost the same as orthogonal). That is:
 *   cells = max(|Δcol|, |Δrow|)
 *   feet  = cells × 5
 * Xanathar's optional 5-10-5 alternating rule is NOT used here —
 * default is RAW 2014 PHB / 2024 PHB consistent.
 *
 * Start cell = the cell the user pressed DOWN in (snapped via
 * snapToCellCenter). End cell = the cell the cursor is currently in.
 * The line is drawn between those two cell centers. Label anchored
 * just below the end cell.
 *
 * Rendering stack uses a small Container with one Graphics + one Text
 * added as a child of the viewport. We addChildAt the end so the
 * ruler paints on top of tokens — a ruler obscured by tokens is
 * useless for combat positioning.
 *
 * Ruler is strictly client-local. No Realtime sync — each user sees
 * their own ruler. Future polish could broadcast ruler positions to
 * other clients to support DM-led tactical discussions.
 */
function RulerLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  active: boolean;
  gridSizePx: number;
}) {
  const { viewport, canvasEl, active, gridSizePx } = props;
  const containerRef = useRef<Container | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);
  const labelRef = useRef<Text | null>(null);
  // v2.256.0 — pointsRef holds the WORLD coords of every committed
  // ruler vertex. Click 1 places the start point; subsequent clicks
  // append segments; right-click or Esc finishes the ruler. The
  // pendingPos cursor is the live preview between the last committed
  // vertex and the mouse.
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);

  // Mount/unmount the ruler display tree whenever the viewport
  // identity or `active` flag changes.
  useEffect(() => {
    if (!viewport || !active) {
      // Tear down if we had any.
      if (containerRef.current) {
        if (!containerRef.current.destroyed && viewport && !viewport.destroyed) {
          viewport.removeChild(containerRef.current);
        }
        if (!containerRef.current.destroyed) containerRef.current.destroy({ children: true });
        containerRef.current = null;
        graphicsRef.current = null;
        labelRef.current = null;
      }
      return;
    }

    const container = new Container();
    container.visible = false; // hidden until first click
    const gfx = new Graphics();
    const label = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontWeight: '700',
        fontSize: 14,
        fill: 0xfbbf24, // yellow for high contrast over maps
        align: 'center',
        stroke: { color: 0x0f1012, width: 3 },
      }),
    });
    label.anchor.set(0.5, 0);
    container.addChild(gfx);
    container.addChild(label);
    viewport.addChild(container); // addChild puts it last = top-most
    containerRef.current = container;
    graphicsRef.current = gfx;
    labelRef.current = label;

    return () => {
      if (!container.destroyed && viewport && !viewport.destroyed) {
        viewport.removeChild(container);
      }
      if (!container.destroyed) container.destroy({ children: true });
      containerRef.current = null;
      graphicsRef.current = null;
      labelRef.current = null;
      pointsRef.current = [];
      pendingPosRef.current = null;
    };
  }, [viewport, active]);

  // Wire pointer handlers on the canvas element. Active only when
  // ruler mode is on AND we have a viewport + canvas to anchor to.
  useEffect(() => {
    if (!active || !viewport || !canvasEl) return;

    function worldPointFromEvent(e: PointerEvent | MouseEvent): { x: number; y: number } | null {
      if (!viewport || !canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      return viewport.toWorld(screenX, screenY);
    }

    /**
     * v2.256.0 — render all committed segments + the pending preview
     * leg from the last committed vertex to the mouse cursor. Distance
     * label sums every leg in feet/cells (Chebyshev per leg) so an
     * L-shaped path reads as the total movement, not just the
     * end-to-end straight line.
     */
    function redraw() {
      const pts = pointsRef.current;
      const pending = pendingPosRef.current;
      const gfx = graphicsRef.current;
      const label = labelRef.current;
      const container = containerRef.current;
      if (!gfx || !label || !container) return;
      if (pts.length === 0) {
        container.visible = false;
        return;
      }

      // Snap every committed vertex AND the preview cursor to cell
      // centers — keeps readings consistent with grid-based movement.
      const snapped = pts.map(p => snapToCellCenter(p.x, p.y, gridSizePx));
      const previewSnapped = pending
        ? snapToCellCenter(pending.x, pending.y, gridSizePx)
        : null;

      gfx.clear();

      // Solid line for committed segments.
      if (snapped.length >= 2) {
        gfx.setStrokeStyle({ color: 0xfbbf24, width: 3, alpha: 0.9 });
        gfx.moveTo(snapped[0].x, snapped[0].y);
        for (let i = 1; i < snapped.length; i++) {
          gfx.lineTo(snapped[i].x, snapped[i].y);
        }
        gfx.stroke();
      }

      // Dashed-feel preview (just lower alpha — Pixi v8 doesn't have
      // a setLineDash; lower alpha + slimmer width reads as "tentative").
      if (previewSnapped) {
        const last = snapped[snapped.length - 1];
        gfx.setStrokeStyle({ color: 0xfbbf24, width: 2, alpha: 0.5 });
        gfx.moveTo(last.x, last.y);
        gfx.lineTo(previewSnapped.x, previewSnapped.y);
        gfx.stroke();
      }

      // Vertex dots — committed in solid yellow, preview tip slightly
      // smaller and dimmer.
      gfx.setFillStyle({ color: 0xfbbf24, alpha: 0.95 });
      for (const p of snapped) gfx.circle(p.x, p.y, 4);
      gfx.fill();
      if (previewSnapped) {
        gfx.setFillStyle({ color: 0xfbbf24, alpha: 0.6 });
        gfx.circle(previewSnapped.x, previewSnapped.y, 3);
        gfx.fill();
      }

      // Sum Chebyshev distance over all legs (committed + preview).
      // Walking the path leg-by-leg gives "total path traveled" rather
      // than "displacement from start," which is what DMs care about
      // when measuring an L-shaped move.
      const allPts = previewSnapped ? [...snapped, previewSnapped] : snapped;
      let totalCells = 0;
      for (let i = 1; i < allPts.length; i++) {
        const dCol = Math.abs(Math.round((allPts[i].x - allPts[i - 1].x) / gridSizePx));
        const dRow = Math.abs(Math.round((allPts[i].y - allPts[i - 1].y) / gridSizePx));
        totalCells += Math.max(dCol, dRow);
      }
      const feet = totalCells * 5;

      label.text = `${feet} ft · ${totalCells} ${totalCells === 1 ? 'cell' : 'cells'}`;
      const tip = previewSnapped ?? snapped[snapped.length - 1];
      label.position.set(tip.x, tip.y + gridSizePx * 0.5);

      container.visible = true;
    }

    function reset() {
      pointsRef.current = [];
      pendingPosRef.current = null;
      const container = containerRef.current;
      if (container) container.visible = false;
    }

    function onDown(e: PointerEvent) {
      // Left-click: add a vertex. First click starts the ruler;
      // subsequent clicks add segments.
      if (e.button === 0 && e.target === canvasEl) {
        const wp = worldPointFromEvent(e);
        if (!wp) return;
        pointsRef.current = [...pointsRef.current, wp];
        pendingPosRef.current = null;
        redraw();
        return;
      }
      // Right-click: finish the ruler (clear all). Stop propagation so
      // the browser context menu (and any token contextmenu fallback)
      // doesn't fire over the canvas.
      if (e.button === 2 && pointsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        reset();
        return;
      }
    }

    function onMove(e: PointerEvent) {
      // Only show preview once at least one vertex is committed.
      if (pointsRef.current.length === 0) return;
      const wp = worldPointFromEvent(e);
      if (!wp) return;
      pendingPosRef.current = wp;
      redraw();
    }

    function onContextMenu(e: MouseEvent) {
      // Suppress browser context menu while ruler is active so
      // right-click can finish the ruler cleanly.
      if (e.target !== canvasEl) return;
      e.preventDefault();
    }

    function onKey(e: KeyboardEvent) {
      // Esc cancels an in-progress ruler. Enter also finishes it (just
      // clears the preview tip; committed vertices stay visible until
      // the user starts a new ruler with the next click).
      if (e.key === 'Escape' && pointsRef.current.length > 0) {
        e.preventDefault();
        reset();
      }
    }

    canvasEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    canvasEl.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      canvasEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      canvasEl.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      reset();
    };
  }, [active, viewport, canvasEl, gridSizePx]);

  return null;
}

/**
 * v2.223 — WallLayer.
 *
 * Renders wall segments (scene_walls) as Graphics line segments in the
 * viewport. Also hosts the wall drawing + delete tool when active.
 *
 * Draw flow (click-click sequence):
 *   1. User enters wall mode via toolbar toggle (active=true)
 *   2. First left-click on canvas: snap to nearest cell corner, store
 *      as pending start point + render an indicator dot
 *   3. Second left-click: snap to nearest cell corner, commit the
 *      segment to DB + local store
 *   4. Escape or switching modes cancels a pending start
 *
 * Delete flow:
 *   - Right-click on canvas while wall mode is active → find nearest
 *     wall segment within hit-threshold → delete it
 *
 * Rendering:
 *   - Walls drawn with purple stroke (matches DM/editor tool palette),
 *     3px width, 85% alpha.
 *   - Pending-start indicator: small circle at the pending endpoint +
 *     dashed preview line to cursor (rubber-band).
 *
 * v2.224 will invisibly consume these walls for vision polygon clipping.
 * For this ship, walls are always visible to everyone for testing.
 */
function WallLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  active: boolean;
  isDM: boolean;
  gridSizePx: number;
  currentSceneId: string | null;
}) {
  const { viewport, canvasEl, active, isDM, gridSizePx, currentSceneId } = props;
  const walls = useBattleMapStore(s => s.walls);

  // Display graphics for existing walls (one Graphics object, redrawn
  // wholesale on any change — wall count is typically small and lines
  // are cheap).
  const wallGfxRef = useRef<Graphics | null>(null);
  // Pending-start indicator + rubber-band preview (only during drawing).
  const previewGfxRef = useRef<Graphics | null>(null);
  // Pending start point in WORLD coords, or null when no drag in progress.
  const pendingStartRef = useRef<{ x: number; y: number } | null>(null);
  // Current cursor world position for rubber-band preview.
  const cursorWorldRef = useRef<{ x: number; y: number } | null>(null);

  // Mount + teardown the display tree on viewport change.
  useEffect(() => {
    if (!viewport) return;
    const wallGfx = new Graphics();
    const previewGfx = new Graphics();
    viewport.addChild(wallGfx);
    viewport.addChild(previewGfx);
    wallGfxRef.current = wallGfx;
    previewGfxRef.current = previewGfx;

    return () => {
      if (!wallGfx.destroyed && !viewport.destroyed) viewport.removeChild(wallGfx);
      if (!wallGfx.destroyed) wallGfx.destroy();
      if (!previewGfx.destroyed && !viewport.destroyed) viewport.removeChild(previewGfx);
      if (!previewGfx.destroyed) previewGfx.destroy();
      wallGfxRef.current = null;
      previewGfxRef.current = null;
      pendingStartRef.current = null;
      cursorWorldRef.current = null;
    };
  }, [viewport]);

  // Redraw the existing walls whenever the walls dict changes.
  useEffect(() => {
    const gfx = wallGfxRef.current;
    if (!gfx || gfx.destroyed) return;
    gfx.clear();
    // v2.271.0 — three visual states based on doorState:
    //   - solid wall (doorState === null): purple stroke, the
    //     existing default
    //   - closed door (doorState === 'closed'): warm gold stroke so
    //     it reads as "different from a wall, but still blocking" —
    //     conceptually a wooden door
    //   - open door (doorState === 'open'): dashed faint gold so the
    //     DM sees the gap exists but visually it's clearly passable
    //
    // We render in three passes (one per state) because Pixi v8
    // Graphics doesn't support per-segment stroke styles on a single
    // path — a single moveTo/lineTo/stroke chain commits one style.
    // Walls per scene are typically <50, so the three-pass cost is
    // immaterial.
    const baseAlpha = active ? 0.95 : 0.85;
    const allWalls = Object.values(walls);
    const solid = allWalls.filter(w => w.doorState === null);
    const closedDoors = allWalls.filter(w => w.doorState === 'closed');
    const openDoors = allWalls.filter(w => w.doorState === 'open');

    // Pass 1: solid walls — purple, the existing style.
    if (solid.length > 0) {
      gfx.setStrokeStyle({ color: 0xa78bfa, width: 3, alpha: baseAlpha });
      for (const w of solid) {
        gfx.moveTo(w.x1, w.y1);
        gfx.lineTo(w.x2, w.y2);
      }
      gfx.stroke();
    }

    // Pass 2: closed doors — warm gold, slightly thicker so they
    // read as a noticeable interactive feature.
    if (closedDoors.length > 0) {
      gfx.setStrokeStyle({ color: 0xd4a017, width: 4, alpha: baseAlpha });
      for (const w of closedDoors) {
        gfx.moveTo(w.x1, w.y1);
        gfx.lineTo(w.x2, w.y2);
      }
      gfx.stroke();
    }

    // Pass 3: open doors — faint gold "ghost" segments so the gap is
    // visible but obviously walkable. We approximate the dashed look
    // with a lower alpha + thinner stroke (Pixi v8 doesn't have
    // first-class line dash support; a true dash would need to
    // segment each door into N pieces, which is more code than
    // value here).
    if (openDoors.length > 0) {
      gfx.setStrokeStyle({ color: 0xd4a017, width: 2, alpha: baseAlpha * 0.4 });
      for (const w of openDoors) {
        gfx.moveTo(w.x1, w.y1);
        gfx.lineTo(w.x2, w.y2);
      }
      gfx.stroke();
    }
  }, [walls, active]);

  // Pending-start + rubber-band preview is drawn on its own Graphics
  // that we re-clear every time the preview changes. Driven by a small
  // loop triggered by pointermove during drawing.
  const redrawPreview = useCallback(() => {
    const gfx = previewGfxRef.current;
    if (!gfx || gfx.destroyed) return;
    gfx.clear();
    const start = pendingStartRef.current;
    const cursor = cursorWorldRef.current;
    if (!start) return;
    // Start indicator dot.
    gfx.setFillStyle({ color: 0xa78bfa, alpha: 0.95 });
    gfx.circle(start.x, start.y, 5);
    gfx.fill();
    // Rubber-band line from start to (snapped) cursor.
    if (cursor) {
      const snapped = snapToGridCorner(cursor.x, cursor.y, gridSizePx);
      gfx.setStrokeStyle({ color: 0xa78bfa, width: 2, alpha: 0.5 });
      gfx.moveTo(start.x, start.y);
      gfx.lineTo(snapped.x, snapped.y);
      gfx.stroke();
      // End indicator dot (where the next click would commit).
      gfx.setFillStyle({ color: 0xa78bfa, alpha: 0.7 });
      gfx.circle(snapped.x, snapped.y, 4);
      gfx.fill();
    }
  }, [gridSizePx]);

  // Wall drawing pointer handlers — active only when `active` AND DM.
  // Players can't edit walls (RLS would reject the INSERT anyway).
  useEffect(() => {
    if (!active || !isDM || !viewport || !canvasEl || !currentSceneId) return;

    function worldFromEvent(e: PointerEvent): { x: number; y: number } | null {
      if (!viewport || !canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      return viewport.toWorld(screenX, screenY);
    }

    function onDown(e: PointerEvent) {
      // Only intercept events targeting the canvas.
      if (e.target !== canvasEl) return;

      // Right-click = delete nearest wall (within threshold).
      if (e.button === 2) {
        const world = worldFromEvent(e);
        if (!world) return;
        const THRESHOLD = Math.max(6, gridSizePx * 0.25);
        let best: { id: string; dist: number } | null = null;
        for (const w of Object.values(useBattleMapStore.getState().walls)) {
          if (w.sceneId !== currentSceneId) continue;
          const d = pointSegmentDistance(world.x, world.y, w.x1, w.y1, w.x2, w.y2);
          if (d < THRESHOLD && (!best || d < best.dist)) {
            best = { id: w.id, dist: d };
          }
        }
        if (best) {
          // Optimistic local remove + async DB delete.
          useBattleMapStore.getState().removeWall(best.id);
          wallsApi.deleteWall(best.id).catch(err =>
            console.error('[WallLayer] deleteWall failed', err)
          );
        }
        e.preventDefault();
        return;
      }

      // Left click = place/commit endpoint.
      if (e.button !== 0) return;
      const world = worldFromEvent(e);
      if (!world) return;

      // v2.271.0 — shift+left-click = cycle door state on nearest
      // wall (within the same threshold the right-click delete uses).
      // The cycle is: solid wall → closed door → open door → solid.
      // Solid + closed both block sight + movement; open blocks
      // neither. Authoring-time intent: most walls are solid; a few
      // get cycled to closed-door at setup; mid-session the DM
      // shift-clicks to flip closed↔open as players approach.
      // Skips placement: when this branch fires, we don't continue
      // into the vertex-placement flow below.
      if (e.shiftKey) {
        const THRESHOLD = Math.max(6, gridSizePx * 0.25);
        let best: { id: string; dist: number } | null = null;
        for (const w of Object.values(useBattleMapStore.getState().walls)) {
          if (w.sceneId !== currentSceneId) continue;
          const d = pointSegmentDistance(world.x, world.y, w.x1, w.y1, w.x2, w.y2);
          if (d < THRESHOLD && (!best || d < best.dist)) {
            best = { id: w.id, dist: d };
          }
        }
        if (best) {
          const wall = useBattleMapStore.getState().walls[best.id];
          if (wall) {
            // Cycle: null → 'closed' → 'open' → null
            const nextState: Wall['doorState'] =
              wall.doorState === null ? 'closed'
              : wall.doorState === 'closed' ? 'open'
              : null;
            // Optimistic update + async DB patch. Realtime echo is
            // idempotent (updateWall merges patch into existing) so
            // the originator's echo is a no-op.
            useBattleMapStore.getState().updateWall(best.id, { doorState: nextState });
            wallsApi.updateWall(best.id, { doorState: nextState }).catch(err =>
              console.error('[WallLayer] updateWall failed', err)
            );
          }
        }
        e.preventDefault();
        return;
      }

      const snapped = snapToGridCorner(world.x, world.y, gridSizePx);

      const start = pendingStartRef.current;
      if (!start) {
        // First click — set pending start.
        pendingStartRef.current = snapped;
        cursorWorldRef.current = snapped;
        redrawPreview();
      } else {
        // Second click — commit wall. Skip zero-length segments.
        if (Math.abs(start.x - snapped.x) < 0.5 && Math.abs(start.y - snapped.y) < 0.5) {
          return;
        }
        const wall: Wall = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `wall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sceneId: currentSceneId,
          x1: start.x,
          y1: start.y,
          x2: snapped.x,
          y2: snapped.y,
          blocksSight: true,
          blocksMovement: true,
          doorState: null,
        };
        // Optimistic insert; realtime echoes back (idempotent).
        useBattleMapStore.getState().addWall(wall);
        wallsApi.createWall(wall).catch(err =>
          console.error('[WallLayer] createWall failed', err)
        );
        // Chain mode: keep the endpoint we just clicked as the new
        // start so the DM can rapidly lay down contiguous walls with
        // one-click-per-vertex. Escape or exiting mode cancels.
        pendingStartRef.current = snapped;
        redrawPreview();
      }
    }

    function onMove(e: PointerEvent) {
      if (!pendingStartRef.current) return;
      const world = worldFromEvent(e);
      if (!world) return;
      cursorWorldRef.current = world;
      redrawPreview();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        pendingStartRef.current = null;
        cursorWorldRef.current = null;
        redrawPreview();
      }
    }

    canvasEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => {
      canvasEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
      // Also clear pending state and preview on mode exit.
      pendingStartRef.current = null;
      cursorWorldRef.current = null;
      redrawPreview();
    };
  }, [active, isDM, viewport, canvasEl, gridSizePx, currentSceneId, redrawPreview]);

  return null;
}

/** Snap world coords to the nearest cell corner. v2.210 exports
 *  snapToGrid which already does this (unlike snapToCellCenter).
 *  Using a dedicated alias here keeps call-sites self-documenting. */
function snapToGridCorner(x: number, y: number, cellSize: number): { x: number; y: number } {
  return {
    x: Math.round(x / cellSize) * cellSize,
    y: Math.round(y / cellSize) * cellSize,
  };
}

/** Perpendicular distance from point (px, py) to line segment
 *  (x1, y1)-(x2, y2). Used for wall hit-detection during delete. */
function pointSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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

/**
 * v2.224 — VisionLayer.
 *
 * Renders fog of war over the scene: dark over everything that's
 * outside any token's visibility polygon, transparent inside.
 *
 * For DM (props.isDM=true): renders nothing at all (omniscient view).
 * For players: renders a Sprite displaying a RenderTexture sized to
 * the world, refreshed whenever vision-relevant inputs change:
 *   - origin tokens move (drag commits, realtime echoes)
 *   - walls added or deleted
 *   - vision range changes (fixed for v2.224)
 *
 * Render approach:
 *   1. Maintain a RenderTexture matching world dims
 *   2. On recompute: clear with dark fog fill
 *   3. For each origin token: compute polygon, render with blend
 *      mode 'erase' which carves a hole in the fog
 *   4. The Sprite displays the result over the world rect
 *
 * 'erase' blend mode (Pixi v8): destination-out — anything drawn
 * with this mode subtracts alpha from what's beneath it. So drawing
 * a white-filled vision polygon on top of dark fog produces a
 * transparent hole in the polygon's shape.
 *
 * Performance: recomputes synchronously on prop change. With a 6-token
 * party + 30 walls + 180 rays per polygon, total is ~10ms — well
 * within frame budget. Heavier scenes will need throttling (debounce
 * during active drag) which we'll add in a follow-up ship.
 *
 * v2.225 will add per-player fog: hide vision contributions of tokens
 * not owned by the current user. v2.224 just shares all party vision
 * with everyone (party-shared sight) which is how Roll20/Foundry
 * default behave anyway.
 */
function VisionLayer(props: {
  viewport: Viewport | null;
  worldWidth: number;
  worldHeight: number;
  gridSizePx: number;
  isDM: boolean;
  /** Character IDs whose linked tokens should contribute vision
   *  polygons. v2.224: every PC in the campaign (party-shared sight).
   *  v2.225 will narrow this to the current user's own characters. */
  visionOriginCharacterIds: string[];
  /** v2.267.0 — when true, render fog for the DM too (Player View
   *  preview). Default false; only the DM toolbar's preview button
   *  flips this. Players never see this prop set. */
  dmPreviewFog?: boolean;
  /** v2.274.0 — scene ambient lighting. Drives whether the fog
   *  layer renders at all and at what alpha:
   *    'bright' → no fog rendering (skipped via fogActive gate);
   *    'dim'    → fog rendered at ~0.55 alpha (mood lighting);
   *    'dark'   → fog rendered at 1.0 alpha (the original behavior).
   *  Vision polygons still cut transparent holes through 'dim' fog so
   *  PCs see clearly within their range; the difference is the
   *  ambient layer outside their cones is partly transparent rather
   *  than fully opaque. */
  ambientLight: 'bright' | 'dim' | 'dark';
}) {
  const { viewport, worldWidth, worldHeight, gridSizePx, isDM, visionOriginCharacterIds, dmPreviewFog, ambientLight } = props;
  // v2.267.0 — effective "should this layer render fog" check. When
  // the DM has enabled Player View preview, treat them like a player
  // for the purposes of mounting + recomputing the fog texture. The
  // DM's own walls + tokens still render normally on top.
  // v2.274.0 — also gated by ambientLight: 'bright' means "no fog at
  // all" so the layer never mounts, regardless of player/DM identity.
  // This is the daylight/outdoor case — players see the whole map.
  const fogActive = ambientLight !== 'bright' && (!isDM || !!dmPreviewFog);
  const tokens = useBattleMapStore(s => s.tokens);
  const walls = useBattleMapStore(s => s.walls);
  const { app } = useApplication();

  // Derive matching token IDs from characterIds. Stable string for
  // useEffect dependency tracking — recomputes only when set changes.
  const visionOriginTokenIds = useMemo(() => {
    const want = new Set(visionOriginCharacterIds);
    const ids: string[] = [];
    for (const t of Object.values(tokens)) {
      if (t.characterId && want.has(t.characterId)) ids.push(t.id);
    }
    // Stable sort so the join key is deterministic.
    ids.sort();
    return ids;
  }, [tokens, visionOriginCharacterIds]);
  const visionOriginKey = visionOriginTokenIds.join('|');

  // RenderTexture + display Sprite + fog Container — all created once
  // and reused. The Container is a scratch space we render INTO the
  // RenderTexture every recompute; it never gets added to the viewport
  // tree directly.
  const rtRef = useRef<RenderTexture | null>(null);
  const fogSpriteRef = useRef<Sprite | null>(null);
  const scratchContainerRef = useRef<Container | null>(null);

  // Mount + teardown. v2.267.0 — was `if (!viewport || isDM) return`;
  // now respects dmPreviewFog so the DM's preview button can mount
  // the fog sprite. Effect re-runs when fogActive flips, so toggling
  // the preview tears down or rebuilds the fog texture cleanly.
  useEffect(() => {
    if (!viewport || !fogActive) return;
    // Create a RenderTexture. We rasterize at world resolution; for
    // very large scenes (4000x4000+) this is memory-heavy and we'd
    // want to downscale, but for typical 30x20 scenes (2100x1400) it
    // fits comfortably in GPU memory (~12MB).
    const rt = RenderTexture.create({
      width: worldWidth,
      height: worldHeight,
      antialias: true,
    });
    const sprite = new Sprite(rt);
    sprite.x = 0;
    sprite.y = 0;
    // v2.332.0 — B2 fix: pointer-transparent overlay.
    //
    // PIXI v8 sprites default to eventMode: 'auto', which means they
    // participate in hit-testing whenever their parent is interactive.
    // Because the fog sprite is a worldWidth × worldHeight rectangle
    // (i.e. it covers EVERY interactive coordinate on the canvas),
    // any pointer-down on a token was hit-testing against the fog
    // FIRST and never reaching the token's drag handler underneath.
    // Symptom: fog renders correctly, but tokens are un-draggable
    // whenever fog is active (DM with dmPreviewFog, or any player).
    //
    // Fog is purely visual — it should be invisible to the event
    // system in every mode. 'none' makes hit-testing skip it entirely
    // so events fall through to the token / wall / ruler layers below.
    sprite.eventMode = 'none';
    // The vision sprite must sit ABOVE walls and tokens (so it can
    // hide them) but NEVER above the ruler. Calling addChild adds it
    // last in the children array = top of stack relative to other
    // viewport children. RulerLayer's children are added on its own
    // mount and we ensure it mounts AFTER VisionLayer in JSX order
    // by render-tree placement.
    viewport.addChild(sprite);
    rtRef.current = rt;
    fogSpriteRef.current = sprite;
    scratchContainerRef.current = new Container();

    return () => {
      if (sprite && !sprite.destroyed) {
        if (!viewport.destroyed) viewport.removeChild(sprite);
        sprite.destroy({ children: false });
      }
      if (rt && !rt.destroyed) rt.destroy(true);
      if (scratchContainerRef.current && !scratchContainerRef.current.destroyed) {
        scratchContainerRef.current.destroy({ children: true });
      }
      rtRef.current = null;
      fogSpriteRef.current = null;
      scratchContainerRef.current = null;
    };
  }, [viewport, worldWidth, worldHeight, fogActive]);

  // v2.342.0 — AoE preview overlay.
  //
  // Subscribes to battleMapStore.aoePreview. When SpellTargetPickerModal
  // (or any future caster surface) sets a center + radius, we draw a
  // translucent ring at the spec'd world position. When it clears the
  // value, we hide the overlay. The single Graphics is mounted once
  // and toggled .visible — same lazy-mount-then-mutate pattern as the
  // turn ring + economy pips.
  //
  // Geometry today: sphere only. Cone/cube/cylinder/line all fall
  // back to the sphere ring at the same radius — matches what
  // findParticipantsInRadius selects, so the visual stays honest with
  // the actual auto-targeting math. When shaped AoE lands, both the
  // selector and this overlay upgrade together.
  //
  // Conversion: gridSizePx pixels = 5ft (D&D standard), so the world-
  // pixel radius for an N-ft sphere is `(N / 5) * gridSizePx`.
  const aoePreview = useBattleMapStore(s => s.aoePreview);
  const aoeRingRef = useRef<Graphics | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const ring = new Graphics();
    ring.eventMode = 'none';
    ring.visible = false;
    viewport.addChild(ring);
    aoeRingRef.current = ring;
    return () => {
      try {
        if (ring.parent && !viewport.destroyed) viewport.removeChild(ring);
        if (!ring.destroyed) ring.destroy();
      } catch { /* viewport torn down — safe to ignore */ }
      aoeRingRef.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    const ring = aoeRingRef.current;
    if (!ring || ring.destroyed) return;
    if (!aoePreview) {
      ring.visible = false;
      return;
    }
    const radiusPx = (aoePreview.sizeFt / 5) * gridSizePx;
    ring.clear();

    const FILL_COLOR = 0xfde68a;
    const FILL_ALPHA = 0.10;
    const STROKE_COLOR = 0xfbbf24;
    const STROKE_WIDTH = 2;
    const STROKE_ALPHA = 0.95;
    const INNER_DOT_ALPHA = 0.8;

    const cx = aoePreview.centerWorldX;
    const cy = aoePreview.centerWorldY;
    const shape = aoePreview.shape;

    // v2.343.0 — shape-aware geometry. The selection logic in
    // findParticipantsInArea is the source of truth; we mirror its
    // shape model here so the visual matches the actual auto-target
    // result. Both upgrade together when shape definitions change.
    if (shape === 'sphere' || shape === 'cylinder') {
      // Circle. radiusPx = full radius of the AoE.
      ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
      ring.circle(cx, cy, radiusPx);
      ring.fill();
      ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
      ring.circle(cx, cy, radiusPx);
      ring.stroke();
    } else if (shape === 'cube') {
      // Square centered on the origin cell. sizeFt is the edge length;
      // half each side from center. Snapping the rect to whole cells
      // would be slightly more accurate but the visual already lines
      // up well enough with the selection at typical zoom levels.
      const halfPx = radiusPx; // sizeFt/5 * gridSizePx — already half-edge in cells
      // Cube: full edge in feet. Selection uses Math.floor(sizeFt/5)
      // cells; reflect that exactly so visual = selection.
      const sizeCells = Math.floor(aoePreview.sizeFt / 5);
      const half = Math.floor(sizeCells / 2);
      const minX = (cx - (half + 0.5) * gridSizePx);
      const minY = (cy - (half + 0.5) * gridSizePx);
      const widthPx = sizeCells * gridSizePx;
      ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
      ring.rect(minX, minY, widthPx, widthPx);
      ring.fill();
      ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
      ring.rect(minX, minY, widthPx, widthPx);
      ring.stroke();
      void halfPx; // silence: used only by sphere; kept readable above
    } else if (shape === 'cone') {
      // Triangular wedge from apex (caster) opening 53° on each side
      // toward the target direction. cos(53.13°) ≈ 0.6 → tan ≈ 1.333.
      // At distance L from apex, half-width = L * tan(53.13°) ≈ L.
      // Practical RAW interpretation: cone is "as wide as it is long"
      // at its far edge — half-width at far edge equals length.
      // We render this as a filled isoceles triangle with one vertex
      // at the apex, two vertices at the corners of the far edge.
      const dx = (aoePreview.directionWorldX ?? cx) - cx;
      const dy = (aoePreview.directionWorldY ?? cy) - cy;
      const dirLen = Math.sqrt(dx * dx + dy * dy);
      if (dirLen > 1e-3) {
        const ndx = dx / dirLen;
        const ndy = dy / dirLen;
        // Perpendicular (rotated 90°)
        const px = -ndy;
        const py = ndx;
        // Far edge at distance = radiusPx (length in pixels).
        // Half-width at far edge = radiusPx (cone is as wide as long).
        const farX = cx + ndx * radiusPx;
        const farY = cy + ndy * radiusPx;
        const cornerLeftX = farX + px * radiusPx;
        const cornerLeftY = farY + py * radiusPx;
        const cornerRightX = farX - px * radiusPx;
        const cornerRightY = farY - py * radiusPx;
        ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
        ring.poly([
          cx, cy,
          cornerLeftX, cornerLeftY,
          cornerRightX, cornerRightY,
        ]);
        ring.fill();
        ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
        ring.poly([
          cx, cy,
          cornerLeftX, cornerLeftY,
          cornerRightX, cornerRightY,
        ]);
        ring.stroke();
      }
    } else if (shape === 'line') {
      // Thick rectangle from origin (caster) toward direction target,
      // length = radiusPx, width = 1 cell (5ft per RAW). The line is
      // drawn as a 4-vertex polygon hugging both sides of the path.
      const dx = (aoePreview.directionWorldX ?? cx) - cx;
      const dy = (aoePreview.directionWorldY ?? cy) - cy;
      const dirLen = Math.sqrt(dx * dx + dy * dy);
      if (dirLen > 1e-3) {
        const ndx = dx / dirLen;
        const ndy = dy / dirLen;
        const px = -ndy;
        const py = ndx;
        const halfWidthPx = gridSizePx / 2; // 2.5ft per side = 1 cell total
        const farX = cx + ndx * radiusPx;
        const farY = cy + ndy * radiusPx;
        ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
        ring.poly([
          cx + px * halfWidthPx,    cy + py * halfWidthPx,
          farX + px * halfWidthPx,  farY + py * halfWidthPx,
          farX - px * halfWidthPx,  farY - py * halfWidthPx,
          cx - px * halfWidthPx,    cy - py * halfWidthPx,
        ]);
        ring.fill();
        ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
        ring.poly([
          cx + px * halfWidthPx,    cy + py * halfWidthPx,
          farX + px * halfWidthPx,  farY + py * halfWidthPx,
          farX - px * halfWidthPx,  farY - py * halfWidthPx,
          cx - px * halfWidthPx,    cy - py * halfWidthPx,
        ]);
        ring.stroke();
      }
    }

    // Inner small ring marks the precise origin cell — common to all
    // shapes so the player can locate the apex/center at a glance.
    ring.setStrokeStyle({ color: STROKE_COLOR, width: 1.5, alpha: INNER_DOT_ALPHA });
    ring.circle(cx, cy, gridSizePx * 0.5);
    ring.stroke();
    ring.visible = true;
  }, [aoePreview, gridSizePx]);

  // v2.344.0 — single-target spell range overlay.
  //
  // Reads battleMapStore.rangePreview. When the spell picker is open
  // for a non-AoE spell with a numeric range, the picker writes the
  // caster's position + range to the store; this effect draws a
  // dashed cyan circle around the caster's token marking the reach
  // boundary. Distinct visually from the gold AoE ring (which uses
  // solid stroke + translucent fill) so the two read differently
  // when both are active simultaneously — e.g. Spirit Guardians
  // (Self emanation: AoE ring) cast with a 30ft range still shows
  // the caster's general targeting reach as a separate concept.
  //
  // Color: cyan (0x60a5fa) — the same hue used elsewhere for
  // informational/reach UI (cover indicators, etc.). Distinct from
  // the gold AoE ring (selection / damage area) and from the
  // green/amber/red drag preview (movement budget).
  //
  // Special-range spells (Self, Sight, Unlimited) skip the overlay —
  // the picker pushes null in those cases, so we just hide.
  const rangePreview = useBattleMapStore(s => s.rangePreview);
  const rangeRingRef = useRef<Graphics | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const ring = new Graphics();
    ring.eventMode = 'none';
    ring.visible = false;
    viewport.addChild(ring);
    rangeRingRef.current = ring;
    return () => {
      try {
        if (ring.parent && !viewport.destroyed) viewport.removeChild(ring);
        if (!ring.destroyed) ring.destroy();
      } catch { /* viewport torn down */ }
      rangeRingRef.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    const ring = rangeRingRef.current;
    if (!ring || ring.destroyed) return;
    if (!rangePreview || rangePreview.rangeFt <= 0) {
      ring.visible = false;
      return;
    }
    const radiusPx = (rangePreview.rangeFt / 5) * gridSizePx;
    ring.clear();
    // Dashed cyan stroke. PIXI v8 has no native dashed-circle helper,
    // so we segment the perimeter into ~24 arcs with alternating
    // visibility — same trick as the v2.340 drag-preview path. At
    // typical zoom this reads as a tasteful broken ring.
    const SEGMENTS = 48;
    const ON = 2;   // arcs drawn
    const OFF = 1;  // arcs skipped
    ring.setStrokeStyle({ color: 0x60a5fa, width: 2, alpha: 0.75 });
    for (let i = 0; i < SEGMENTS; i++) {
      const cycle = i % (ON + OFF);
      if (cycle >= ON) continue;
      const a0 = (i / SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
      const x0 = rangePreview.centerWorldX + Math.cos(a0) * radiusPx;
      const y0 = rangePreview.centerWorldY + Math.sin(a0) * radiusPx;
      const x1 = rangePreview.centerWorldX + Math.cos(a1) * radiusPx;
      const y1 = rangePreview.centerWorldY + Math.sin(a1) * radiusPx;
      ring.moveTo(x0, y0);
      ring.lineTo(x1, y1);
    }
    ring.stroke();
    ring.visible = true;
  }, [rangePreview, gridSizePx]);

  // Recompute fog whenever inputs change. We rebuild the scratch
  // container, render it to the RT, and let the sprite redisplay.
  // v2.267.0 — gate is fogActive (was isDM) so the DM's preview also
  // recomputes when walls or tokens move while preview is on.
  useEffect(() => {
    if (!fogActive) return;
    const rt = rtRef.current;
    const scratch = scratchContainerRef.current;
    if (!rt || !scratch || !app?.renderer) return;

    // Clear scratch and rebuild from scratch every recompute. For
    // scene/world scale this is cheap (a few Graphics instances).
    scratch.removeChildren().forEach(child => {
      if (!(child as any).destroyed) (child as any).destroy({ children: true });
    });

    // v2.267.0 — guard for the DM-preview case: if the DM toggles
    // Player View on but no PC tokens exist on the scene, there's
    // no vision origin to compute from. Rendering a solid-black fog
    // would be misleading ("preview is broken!" / "the map turned
    // black"). For DM preview, render a clear texture so the DM can
    // see the map and understand they need PC tokens for the preview
    // to be meaningful. For real player views, keep the solid fog —
    // a player who can't see anything because their character isn't
    // placed is the correct semantic state, not a UX bug.
    if (isDM && dmPreviewFog && visionOriginTokenIds.length === 0) {
      app.renderer.render({ container: scratch, target: rt, clear: true });
      return;
    }

    // 1. Dark fog fill covering the entire world.
    // v2.274.0 — alpha varies with ambientLight:
    //   - 'dark' (default, current behavior): full opaque (alpha 1).
    //     Outside vision polygons = pure black.
    //   - 'dim' : translucent (alpha ~0.55). The map shows through but
    //     muted, and the vision polygons still cut clear holes for the
    //     player's actual sight cone. Reads as "twilight / mood".
    //   - 'bright' : we'd never reach here because the fogActive gate
    //     already returned early. Defensive fallback to 'dark' alpha
    //     just in case the gate logic changes.
    const fogAlpha = ambientLight === 'dim' ? 0.55 : 1;
    const fog = new Graphics();
    fog.rect(0, 0, worldWidth, worldHeight);
    fog.fill({ color: 0x0a0c10, alpha: fogAlpha });
    scratch.addChild(fog);

    // 2. For each origin token, compute polygon and draw with erase
    //    blend mode to cut a hole in the fog.
    // v2.271.0 — open doors ('open' doorState) don't block sight,
    // mirroring the same rule the movement-collision check uses. A
    // door that's been opened by the DM creates a vision corridor.
    // Closed doors (doorState === 'closed') and solid walls
    // (doorState === null) both block normally.
    const sightWalls: WallSegment[] = [];
    for (const w of Object.values(walls)) {
      if (!w.blocksSight) continue;
      if (w.doorState === 'open') continue;
      sightWalls.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
    }
    // 60ft = 12 cells × cell size in pixels. Hardcoded for v2.224;
    // v2.226 will read per-character darkvision/normal-vision range.
    const VISION_RANGE_PX = 12 * gridSizePx;

    for (const tokenId of visionOriginTokenIds) {
      const t = tokens[tokenId];
      if (!t) continue;
      const polygon = computeVisibilityPolygon(t.x, t.y, sightWalls, VISION_RANGE_PX, 180);
      if (polygon.length < 6) continue; // need at least 3 points to form a polygon
      const lightGfx = new Graphics();
      lightGfx.poly(polygon);
      lightGfx.fill({ color: 0xffffff, alpha: 1 });
      // 'erase' blend = destination-out. The white polygon erases
      // alpha from the fog beneath it, leaving a transparent hole.
      lightGfx.blendMode = 'erase';
      scratch.addChild(lightGfx);
    }

    // 3. Render the scratch container to our RenderTexture.
    app.renderer.render({ container: scratch, target: rt, clear: true });
  }, [tokens, walls, visionOriginKey, visionOriginTokenIds, worldWidth, worldHeight, gridSizePx, fogActive, isDM, dmPreviewFog, ambientLight, app]);

  return null;
}

/**
 * v2.234.0 — TextLayer.
 *
 * Renders text annotations (scene_texts) as Pixi Text instances inside
 * a Container attached to the viewport. Each row in the store becomes
 * one Pixi Text anchored at world (x,y), styled with its color +
 * fontSize, with a black stroke for legibility over busy maps.
 *
 * Authoring (DM only, only when `active`):
 *   - Left-click empty space → window.prompt for text → create + sync.
 *   - Left-click on existing text → window.prompt to edit → update + sync.
 *   - Right-click on existing text → confirm + delete + sync.
 *
 * Outside `active` mode the layer is purely visual — no event handlers
 * fire. window.prompt is intentionally crude for v1; future ship can
 * replace with an inline DOM input.
 *
 * Hit-testing uses Pixi Text bounding boxes in world coords (cheap;
 * texts are small in count).
 */
function TextLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  active: boolean;
  isDM: boolean;
  currentSceneId: string | null;
  // v2.255.0 — when true (and active is false), left-mouse-drag on an
  // existing text translates it. Right-click still deletes; left-click
  // without a drag still does nothing in select mode (text edits
  // happen via the text-tool flow above).
  selectMode?: boolean;
  // v2.255.0 — undo/redo: caller passes the record fn so create/edit/
  // delete/move all push reverse closures onto the history stack.
  recordUndoable?: (action: import('../../lib/hooks/useUndoRedo').UndoableAction) => void;
}) {
  const { viewport, canvasEl, active, isDM, currentSceneId, selectMode, recordUndoable } = props;
  const texts = useBattleMapStore(s => s.texts);
  const containerRef = useRef<Container | null>(null);
  // v2.241 — non-blocking modal handles for prompts/confirms.
  const { prompt: promptModal, confirm: confirmModal } = useModal();
  // The pointer handlers below are attached as plain MouseEvent
  // listeners (not React events) so they can't read fresh state from
  // closures. Mirror the modal handles into refs so the handlers
  // always call the latest provider methods.
  const promptRef = useRef(promptModal);
  const confirmRef = useRef(confirmModal);
  useEffect(() => { promptRef.current = promptModal; }, [promptModal]);
  useEffect(() => { confirmRef.current = confirmModal; }, [confirmModal]);
  // v2.255.0 — same ref-mirroring pattern for the new props.
  const recordUndoableRef = useRef(recordUndoable);
  useEffect(() => { recordUndoableRef.current = recordUndoable; }, [recordUndoable]);

  // Mount/unmount the container that holds all Text children.
  useEffect(() => {
    if (!viewport) return;
    const c = new Container();
    containerRef.current = c;
    viewport.addChild(c);
    return () => {
      try { viewport.removeChild(c); } catch { /* viewport gone */ }
      try { c.destroy({ children: true }); } catch { /* destroyed */ }
      containerRef.current = null;
    };
  }, [viewport]);

  // Sync visible Text children whenever store texts change. Wholesale
  // rebuild — text counts are typically small (~tens) and the perf
  // win from diffing isn't worth the complexity yet.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const old = [...c.children];
    c.removeChildren();
    for (const child of old) {
      try { (child as any).destroy?.(); } catch { /* ignore */ }
    }
    for (const t of Object.values(texts)) {
      if (currentSceneId && t.sceneId !== currentSceneId) continue;
      const txt = new Text({
        text: t.text,
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: t.fontSize,
          fontWeight: '700',
          fill: t.color,
          stroke: { color: 0x000000, width: 3 },
          align: 'center',
        }),
      });
      txt.anchor.set(0.5, 0.5);
      txt.x = t.x;
      txt.y = t.y;
      // Stash the SceneText id so right-click hit-testing can locate
      // it without re-querying the store by coordinate.
      (txt as any).__sceneTextId = t.id;
      c.addChild(txt);
    }
  }, [texts, currentSceneId]);

  // Left-click + right-click handlers. Only attach when `active` is
  // true so non-text-mode interactions aren't intercepted.
  useEffect(() => {
    if (!active || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    function findTextAt(world: { x: number; y: number }): SceneText | null {
      const c = containerRef.current;
      if (!c) return null;
      // Iterate top-to-bottom (last drawn on top) for natural picking.
      for (let i = c.children.length - 1; i >= 0; i--) {
        const child = c.children[i];
        const id = (child as any).__sceneTextId as string | undefined;
        if (!id) continue;
        // Use viewport-space bounds via getBounds (Pixi v8 returns
        // a {minX,minY,maxX,maxY} bound box in world coords for
        // children of the viewport).
        const b = child.getBounds();
        if (world.x >= b.minX && world.x <= b.maxX
            && world.y >= b.minY && world.y <= b.maxY) {
          const found = useBattleMapStore.getState().texts[id];
          if (found) return found;
        }
      }
      return null;
    }

    async function onLeftClick(e: MouseEvent) {
      // Only react to primary button; ignore middle/right/etc.
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;

      const existing = findTextAt(w);
      if (existing) {
        // v2.241 — edit existing text via inline modal (was window.prompt).
        const next = await promptRef.current({
          title: 'Edit text',
          defaultValue: existing.text,
          confirmLabel: 'Save',
          // allowEmpty so we can detect empty submission and route to
          // a follow-up delete-confirm instead of silently bailing.
          allowEmpty: true,
        });
        if (next == null) return;
        const trimmed = next.trim();
        if (trimmed === existing.text) return;
        if (trimmed === '') {
          // Empty edit → treat as delete intent.
          const ok = await confirmRef.current({
            title: 'Delete this annotation?',
            message: `"${existing.text}" will be removed from the map.`,
            confirmLabel: 'Delete',
            danger: true,
          });
          if (!ok) return;
          // v2.255.0 — undo: snapshot the full text so undo can re-add it.
          const snapshot = { ...existing };
          useBattleMapStore.getState().removeText(existing.id);
          textsApi.deleteText(existing.id).catch(err =>
            console.error('[TextLayer] deleteText failed', err));
          recordUndoableRef.current?.({
            label: `delete text "${snapshot.text}"`,
            forward: () => {
              useBattleMapStore.getState().removeText(snapshot.id);
              return textsApi.deleteText(snapshot.id).then(() => undefined);
            },
            backward: () => {
              useBattleMapStore.getState().addText(snapshot);
              return textsApi.createText(snapshot).then(() => undefined);
            },
          });
          return;
        }
        // v2.255.0 — undo: capture before/after text for round-trip.
        const beforeText = existing.text;
        const afterText = trimmed;
        useBattleMapStore.getState().updateText(existing.id, { text: trimmed });
        textsApi.updateText(existing.id, { text: trimmed }).catch(err =>
          console.error('[TextLayer] updateText failed', err));
        recordUndoableRef.current?.({
          label: `edit text → "${afterText}"`,
          forward: () => {
            useBattleMapStore.getState().updateText(existing.id, { text: afterText });
            return textsApi.updateText(existing.id, { text: afterText }).then(() => undefined);
          },
          backward: () => {
            useBattleMapStore.getState().updateText(existing.id, { text: beforeText });
            return textsApi.updateText(existing.id, { text: beforeText }).then(() => undefined);
          },
        });
        return;
      }

      // Empty space — create a new annotation. v2.241 — was window.prompt.
      const value = await promptRef.current({
        title: 'New text annotation',
        placeholder: 'Type a label…',
        confirmLabel: 'Add',
      });
      if (value == null) return;
      const trimmed = value.trim();
      if (trimmed === '') return;
      const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (!currentSceneId) return;
      const newText: SceneText = {
        id,
        sceneId: currentSceneId,
        x: w.x,
        y: w.y,
        text: trimmed,
        color: '#ffffff',
        fontSize: 16,
      };
      // Optimistic local insert + fire-and-forget DB write. Realtime
      // echo is idempotent (addText is upsert-by-id).
      useBattleMapStore.getState().addText(newText);
      textsApi.createText(newText).catch(err =>
        console.error('[TextLayer] createText failed', err));
      // v2.255.0 — undo: round-trip via add/delete.
      recordUndoableRef.current?.({
        label: `add text "${trimmed}"`,
        forward: () => {
          useBattleMapStore.getState().addText(newText);
          return textsApi.createText(newText).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().removeText(newText.id);
          return textsApi.deleteText(newText.id).then(() => undefined);
        },
      });
    }

    async function onRightClick(e: MouseEvent) {
      const w = clientToWorld(e);
      if (!w) return;
      const found = findTextAt(w);
      if (!found) return;
      // We're on top of an existing annotation — claim the event so
      // it doesn't bubble up to the wrapper-level token context menu.
      e.stopPropagation();
      e.preventDefault();
      // v2.241 — was window.confirm.
      const ok = await confirmRef.current({
        title: 'Delete text annotation?',
        message: `"${found.text}" will be removed from the map.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      // v2.255.0 — undo: snapshot before delete so we can restore.
      const snapshot = { ...found };
      useBattleMapStore.getState().removeText(found.id);
      textsApi.deleteText(found.id).catch(err =>
        console.error('[TextLayer] deleteText failed', err));
      recordUndoableRef.current?.({
        label: `delete text "${snapshot.text}"`,
        forward: () => {
          useBattleMapStore.getState().removeText(snapshot.id);
          return textsApi.deleteText(snapshot.id).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().addText(snapshot);
          return textsApi.createText(snapshot).then(() => undefined);
        },
      });
    }

    canvasEl.addEventListener('click', onLeftClick);
    // Capture phase so we can intercept before the wrapper's
    // contextmenu preventDefault that's set up at the canvas-wrapper
    // level (which is fine for tokens; here we want our own logic).
    canvasEl.addEventListener('contextmenu', onRightClick, true);
    return () => {
      canvasEl.removeEventListener('click', onLeftClick);
      canvasEl.removeEventListener('contextmenu', onRightClick, true);
    };
  }, [active, canvasEl, viewport, isDM, currentSceneId]);

  // v2.255.0 — Select-mode drag-to-reposition. Separate effect so it
  // attaches independently of the text-tool active flag. Listens for
  // mouse-down on a text in select mode (no tool active), tracks the
  // drag, and commits the new position on mouseup. Records an undo
  // entry only on actual movement (a click that doesn't drag is a
  // no-op so we don't pollute the history).
  useEffect(() => {
    if (!selectMode || active || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    function findTextAt(world: { x: number; y: number }): SceneText | null {
      const c = containerRef.current;
      if (!c) return null;
      for (let i = c.children.length - 1; i >= 0; i--) {
        const child = c.children[i];
        const id = (child as any).__sceneTextId as string | undefined;
        if (!id) continue;
        const b = child.getBounds();
        if (world.x >= b.minX && world.x <= b.maxX
            && world.y >= b.minY && world.y <= b.maxY) {
          const found = useBattleMapStore.getState().texts[id];
          if (found) return found;
        }
      }
      return null;
    }

    // Drag state. Starts null; populated on mousedown over a text.
    // We snapshot the original x/y for both undo and the cancel-on-
    // tiny-movement guard.
    let drag: {
      id: string;
      startWorld: { x: number; y: number };
      startTextX: number;
      startTextY: number;
    } | null = null;

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;
      const hit = findTextAt(w);
      if (!hit) return;
      drag = {
        id: hit.id,
        startWorld: w,
        startTextX: hit.x,
        startTextY: hit.y,
      };
      // Don't preventDefault here — let viewport panning detection still
      // see the down. We claim move/up only.
    }

    function onMove(e: MouseEvent) {
      if (!drag) return;
      const w = clientToWorld(e);
      if (!w) return;
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      useBattleMapStore.getState().updateText(drag.id, {
        x: drag.startTextX + dx,
        y: drag.startTextY + dy,
      });
    }

    function onUp(e: MouseEvent) {
      if (!drag) return;
      const w = clientToWorld(e);
      if (!w) { drag = null; return; }
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      // Threshold: < 2 world-px is "click, not drag" — bail without
      // committing or recording undo. Pixi click handler above will
      // fire and route to the edit-text flow.
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) { drag = null; return; }
      const finalX = drag.startTextX + dx;
      const finalY = drag.startTextY + dy;
      const id = drag.id;
      const beforeX = drag.startTextX;
      const beforeY = drag.startTextY;
      drag = null;
      // Commit to DB. Local store was already updated mid-drag.
      textsApi.updateText(id, { x: finalX, y: finalY }).catch(err =>
        console.error('[TextLayer] drag commit failed', err));
      recordUndoableRef.current?.({
        label: 'move text',
        forward: () => {
          useBattleMapStore.getState().updateText(id, { x: finalX, y: finalY });
          return textsApi.updateText(id, { x: finalX, y: finalY }).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().updateText(id, { x: beforeX, y: beforeY });
          return textsApi.updateText(id, { x: beforeX, y: beforeY }).then(() => undefined);
        },
      });
    }

    canvasEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvasEl.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [selectMode, active, canvasEl, viewport, isDM, currentSceneId]);

  return null;
}

/**
 * v2.235.0 — DrawingLayer.
 *
 * Renders all scene_drawings (pencil/line/rect/circle) as Pixi
 * Graphics inside a Container attached to the viewport. When a
 * drawing tool is `active`, mouse-down → drag → mouse-up authors a
 * new drawing of the active kind. Right-click on an existing drawing
 * deletes it (active mode only — outside active mode, right-click
 * goes through to the normal token context-menu pipeline).
 *
 * Authoring shape semantics:
 *   - pencil: append world-space samples on every pointermove during
 *             the drag; persist the polyline on pointerup. We
 *             intentionally do NOT decimate or simplify in the client;
 *             counts are typically a few hundred points which is fine
 *             for round-trip + redraw.
 *   - line:   2 points (down → up).
 *   - rect:   2 points (down → up; rendered as the bounding box).
 *   - circle: 2 points (down = center, up = edge for radius).
 *
 * Live preview during drag uses a separate "preview" Graphics drawn
 * with the active color/width; on pointerup the preview is committed
 * to the store (optimistic) + sent to the DB (fire-and-forget).
 *
 * Color/width come from refs that mirror the parent's pickable state,
 * so changes to the picker don't tear down the canvas listeners.
 */
function DrawingLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  /** Which drawing kind is active, or null for "no drawing tool". */
  activeKind: DrawingKind | null;
  isDM: boolean;
  currentSceneId: string | null;
  /** Hex color string for new drawings. */
  color: string;
  /** Stroke width in pixels for new drawings. */
  lineWidth: number;
  // v2.255.0 — same select-mode drag-to-reposition + undo plumbing as
  // TextLayer. Drag in select mode translates the drawing (all points
  // shifted by dx/dy); record() pushes reverse closures for create/
  // delete/move so Cmd-Z reverts.
  selectMode?: boolean;
  recordUndoable?: (action: import('../../lib/hooks/useUndoRedo').UndoableAction) => void;
  // v2.269.0 — eraser mode. When true, this layer attaches a separate
  // pointer effect: left-click anywhere → if the click landed on a
  // drawing, delete it (with undo). No confirm dialog — eraser-mode
  // is itself the explicit intent. Right-click context-menu delete
  // (which DOES confirm) remains available outside eraser mode.
  // Misses on empty space are silent no-ops; no toast spam.
  eraserActive?: boolean;
  // v2.287.0 — Eraser also targets walls now; the wall-detection
  // threshold scales with grid size (max(6, gridSizePx*0.25)) to
  // match the wall-mode right-click-delete feel. Plumbed in as a
  // prop because the store doesn't carry grid info — it's a
  // viewport/scene rendering concern owned by the parent.
  gridSizePx?: number;
}) {
  const { viewport, canvasEl, activeKind, isDM, currentSceneId, color, lineWidth, selectMode, recordUndoable, eraserActive, gridSizePx } = props;
  const drawings = useBattleMapStore(s => s.drawings);
  const containerRef = useRef<Container | null>(null);
  const previewGfxRef = useRef<Graphics | null>(null);
  // v2.241 — non-blocking confirm modal (replaces window.confirm in onContextMenu).
  const { confirm: confirmModal } = useModal();
  const confirmRef = useRef(confirmModal);
  useEffect(() => { confirmRef.current = confirmModal; }, [confirmModal]);

  // Mirror the picker state into refs so the pointer handlers can
  // read them without re-attaching listeners on every color/width change.
  const colorRef = useRef(color);
  const widthRef = useRef(lineWidth);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { widthRef.current = lineWidth; }, [lineWidth]);
  const activeKindRef = useRef<DrawingKind | null>(null);
  useEffect(() => { activeKindRef.current = activeKind; }, [activeKind]);
  // v2.255.0 — undo record fn ref, same pattern as elsewhere.
  const recordUndoableRef = useRef(recordUndoable);
  useEffect(() => { recordUndoableRef.current = recordUndoable; }, [recordUndoable]);

  // Mount/unmount drawings container (committed shapes).
  useEffect(() => {
    if (!viewport) return;
    const c = new Container();
    containerRef.current = c;
    viewport.addChild(c);
    const preview = new Graphics();
    previewGfxRef.current = preview;
    viewport.addChild(preview);
    return () => {
      try { viewport.removeChild(c); } catch { /* viewport gone */ }
      try { c.destroy({ children: true }); } catch { /* destroyed */ }
      try { viewport.removeChild(preview); } catch { /* viewport gone */ }
      try { preview.destroy(); } catch { /* destroyed */ }
      containerRef.current = null;
      previewGfxRef.current = null;
    };
  }, [viewport]);

  // Convert hex string '#a78bfa' to a 24-bit number 0xa78bfa for Pixi.
  function hexToNumber(hex: string): number {
    const trimmed = hex.replace('#', '').slice(0, 6);
    const n = parseInt(trimmed, 16);
    return Number.isFinite(n) ? n : 0xffffff;
  }

  // Render a single SceneDrawing into a Graphics instance.
  function drawShapeInto(g: Graphics, d: SceneDrawing) {
    const colNum = hexToNumber(d.color);
    g.setStrokeStyle({ width: d.lineWidth, color: colNum, alpha: 1, alignment: 0.5 });
    if (d.kind === 'pencil') {
      if (d.points.length >= 2) {
        g.moveTo(d.points[0].x, d.points[0].y);
        for (let i = 1; i < d.points.length; i++) {
          g.lineTo(d.points[i].x, d.points[i].y);
        }
        g.stroke();
      }
    } else if (d.kind === 'line') {
      if (d.points.length >= 2) {
        const [a, b] = d.points;
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke();
      }
    } else if (d.kind === 'rect') {
      if (d.points.length >= 2) {
        const [a, b] = d.points;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        g.rect(x, y, w, h).stroke();
      }
    } else if (d.kind === 'circle') {
      if (d.points.length >= 2) {
        const [c, edge] = d.points;
        const r = Math.hypot(edge.x - c.x, edge.y - c.y);
        g.circle(c.x, c.y, r).stroke();
      }
    }
  }

  // Sync committed drawings to the layer container on store change.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const old = [...c.children];
    c.removeChildren();
    for (const child of old) {
      try { (child as any).destroy?.(); } catch { /* ignore */ }
    }
    for (const d of Object.values(drawings)) {
      if (currentSceneId && d.sceneId !== currentSceneId) continue;
      const g = new Graphics();
      drawShapeInto(g, d);
      (g as any).__drawingId = d.id;
      c.addChild(g);
    }
  }, [drawings, currentSceneId]);

  // Pointer drag → author a new drawing. Only attached when a drawing
  // tool is active.
  useEffect(() => {
    if (!activeKind || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    let dragging = false;
    const samples: Array<{ x: number; y: number }> = [];

    function renderPreview() {
      const g = previewGfxRef.current;
      if (!g) return;
      g.clear();
      const kind = activeKindRef.current;
      if (!kind || samples.length === 0) return;
      const colNum = hexToNumber(colorRef.current);
      g.setStrokeStyle({ width: widthRef.current, color: colNum, alpha: 0.85, alignment: 0.5 });
      if (kind === 'pencil') {
        if (samples.length >= 2) {
          g.moveTo(samples[0].x, samples[0].y);
          for (let i = 1; i < samples.length; i++) {
            g.lineTo(samples[i].x, samples[i].y);
          }
          g.stroke();
        }
      } else if (kind === 'line' && samples.length >= 2) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke();
      } else if (kind === 'rect' && samples.length >= 2) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        g.rect(x, y, w, h).stroke();
      } else if (kind === 'circle' && samples.length >= 2) {
        const c = samples[0];
        const edge = samples[samples.length - 1];
        const r = Math.hypot(edge.x - c.x, edge.y - c.y);
        if (r > 0) g.circle(c.x, c.y, r).stroke();
      }
    }

    function findDrawingAt(world: { x: number; y: number }): SceneDrawing | null {
      const c = containerRef.current;
      if (!c) return null;
      for (let i = c.children.length - 1; i >= 0; i--) {
        const child = c.children[i];
        const id = (child as any).__drawingId as string | undefined;
        if (!id) continue;
        const b = child.getBounds();
        // Padded hit-test box so thin strokes are still pickable.
        const pad = 6;
        if (world.x >= b.minX - pad && world.x <= b.maxX + pad
            && world.y >= b.minY - pad && world.y <= b.maxY + pad) {
          const found = useBattleMapStore.getState().drawings[id];
          if (found) return found;
        }
      }
      return null;
    }

    function onPointerDown(e: MouseEvent) {
      if (e.button !== 0) return; // primary only
      const w = clientToWorld(e);
      if (!w) return;
      dragging = true;
      samples.length = 0;
      samples.push(w);
      renderPreview();
    }

    function onPointerMove(e: MouseEvent) {
      if (!dragging) return;
      const w = clientToWorld(e);
      if (!w) return;
      const kind = activeKindRef.current;
      if (kind === 'pencil') {
        // Append every sample for freehand fidelity.
        samples.push(w);
      } else {
        // For shape primitives, only the latest endpoint matters.
        if (samples.length === 1) samples.push(w);
        else samples[samples.length - 1] = w;
      }
      renderPreview();
    }

    function onPointerUp(_e: MouseEvent) {
      if (!dragging) return;
      dragging = false;
      const kind = activeKindRef.current;
      const g = previewGfxRef.current;
      if (g) g.clear();
      if (!kind || !currentSceneId) return;
      // Need at least 2 distinct points; otherwise the user just clicked
      // without dragging — discard.
      if (samples.length < 2) return;
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (kind !== 'pencil' && first.x === last.x && first.y === last.y) return;

      // Build the persisted drawing. For shape primitives we keep just
      // the two endpoints (anchor + endpoint); for pencil we keep all
      // samples.
      const points = kind === 'pencil' ? samples.slice() : [first, last];
      const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const drawing: SceneDrawing = {
        id,
        sceneId: currentSceneId,
        kind,
        points,
        color: colorRef.current,
        lineWidth: widthRef.current,
      };
      useBattleMapStore.getState().addDrawing(drawing);
      drawingsApi.createDrawing(drawing).catch(err =>
        console.error('[DrawingLayer] createDrawing failed', err));
      // v2.255.0 — undo: round-trip via add/delete.
      recordUndoableRef.current?.({
        label: `add ${drawing.kind}`,
        forward: () => {
          useBattleMapStore.getState().addDrawing(drawing);
          return drawingsApi.createDrawing(drawing).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().removeDrawing(drawing.id);
          return drawingsApi.deleteDrawing(drawing.id).then(() => undefined);
        },
      });
    }

    async function onContextMenu(e: MouseEvent) {
      const w = clientToWorld(e);
      if (!w) return;
      const found = findDrawingAt(w);
      if (!found) return;
      e.stopPropagation();
      e.preventDefault();
      // v2.241 — was window.confirm.
      const ok = await confirmRef.current({
        title: 'Delete this drawing?',
        message: `${found.kind.charAt(0).toUpperCase() + found.kind.slice(1)} will be removed from the map.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      // v2.255.0 — undo: snapshot the full drawing so undo can re-add it.
      const snapshot = { ...found, points: found.points.map(p => ({ ...p })) };
      useBattleMapStore.getState().removeDrawing(found.id);
      drawingsApi.deleteDrawing(found.id).catch(err =>
        console.error('[DrawingLayer] deleteDrawing failed', err));
      recordUndoableRef.current?.({
        label: `delete ${snapshot.kind}`,
        forward: () => {
          useBattleMapStore.getState().removeDrawing(snapshot.id);
          return drawingsApi.deleteDrawing(snapshot.id).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().addDrawing(snapshot);
          return drawingsApi.createDrawing(snapshot).then(() => undefined);
        },
      });
    }

    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    // pointerup goes on window so a drag that ends outside the canvas
    // still terminates cleanly.
    window.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('contextmenu', onContextMenu, true);
      // Clear any in-flight preview when the layer detaches.
      const g = previewGfxRef.current;
      if (g) g.clear();
    };
  }, [activeKind, canvasEl, viewport, isDM, currentSceneId]);

  // v2.255.0 — Select-mode drag-to-reposition for drawings. Same shape
  // as TextLayer's: gated on selectMode && !activeKind, mouse-down
  // captures the hit drawing, mouse-move shifts all points, mouse-up
  // commits + records undo. Pencil drawings translate as a unit (every
  // sample shifts by dx/dy), preserving the freehand shape.
  useEffect(() => {
    if (!selectMode || activeKind || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    function findDrawingAt(world: { x: number; y: number }): SceneDrawing | null {
      const c = containerRef.current;
      if (!c) return null;
      for (let i = c.children.length - 1; i >= 0; i--) {
        const child = c.children[i];
        const id = (child as any).__drawingId as string | undefined;
        if (!id) continue;
        const b = child.getBounds();
        const pad = 6;
        if (world.x >= b.minX - pad && world.x <= b.maxX + pad
            && world.y >= b.minY - pad && world.y <= b.maxY + pad) {
          const found = useBattleMapStore.getState().drawings[id];
          if (found) return found;
        }
      }
      return null;
    }

    let drag: {
      id: string;
      startWorld: { x: number; y: number };
      startPoints: { x: number; y: number }[];
    } | null = null;

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;
      const hit = findDrawingAt(w);
      if (!hit) return;
      drag = {
        id: hit.id,
        startWorld: w,
        // Deep-copy points so the original isn't mutated mid-drag.
        startPoints: hit.points.map(p => ({ ...p })),
      };
    }

    function onMove(e: MouseEvent) {
      if (!drag) return;
      const w = clientToWorld(e);
      if (!w) return;
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      const shifted = drag.startPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
      useBattleMapStore.getState().updateDrawing(drag.id, { points: shifted });
    }

    function onUp(e: MouseEvent) {
      if (!drag) return;
      const w = clientToWorld(e);
      if (!w) { drag = null; return; }
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      // Same 2-px deadzone as TextLayer.
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) { drag = null; return; }
      const id = drag.id;
      const startPoints = drag.startPoints;
      const finalPoints = startPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
      drag = null;
      drawingsApi.updateDrawing(id, { points: finalPoints }).catch(err =>
        console.error('[DrawingLayer] drag commit failed', err));
      recordUndoableRef.current?.({
        label: 'move drawing',
        forward: () => {
          useBattleMapStore.getState().updateDrawing(id, { points: finalPoints });
          return drawingsApi.updateDrawing(id, { points: finalPoints }).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().updateDrawing(id, { points: startPoints });
          return drawingsApi.updateDrawing(id, { points: startPoints }).then(() => undefined);
        },
      });
    }

    canvasEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvasEl.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [selectMode, activeKind, canvasEl, viewport, isDM, currentSceneId]);

  // v2.269.0 — eraser pointer effect. Independent from the draw and
  // select-drag effects: only active when eraserActive is on. Listens
  // for left-click anywhere on the canvas, hit-tests against the
  // committed drawings container, and deletes the topmost hit (with
  // undo). Right-click is left alone — the existing context-menu
  // delete still works in any mode.
  //
  // Intentionally no drag / multi-erase: each click is one delete.
  // Drag-to-erase a swath would be nice but adds significant scope
  // (per-pointermove hit-tests + dedup so a slow drag doesn't fire
  // a hundred deletes on the same shape). Single-click is enough for
  // the cleanup workflow ("oops, wrong rectangle, click and gone").
  useEffect(() => {
    if (!eraserActive || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    // v2.287.0 — Shape-aware hit-test, replacing the v2.269 AABB pad.
    // The old test (`world inside child.getBounds() padded 6px`) erased
    // any drawing whose axis-aligned bounding box covered the click —
    // disastrous for diagonal lines and large pencil strokes whose AABB
    // is mostly empty space. New approach: per-shape distance to the
    // visually-occupied geometry; a click "hits" if that distance is
    // <= the drawing's stroke half-width plus a tolerance band so thin
    // lines remain easy to grab on touchscreens / high-DPI.
    function distanceToDrawing(world: { x: number; y: number }, d: SceneDrawing): number {
      const pts = d.points;
      if (!pts || pts.length === 0) return Infinity;
      switch (d.kind) {
        case 'line': {
          // Two-point primitive: distance to the segment.
          if (pts.length < 2) return Infinity;
          return pointSegmentDistance(world.x, world.y, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
        }
        case 'pencil': {
          // Polyline: distance to the nearest segment. Single-point
          // pencil dabs (kind === 'pencil' with 1 point) fall back to
          // straight Euclidean distance to that point.
          if (pts.length === 1) {
            const dx = world.x - pts[0].x;
            const dy = world.y - pts[0].y;
            return Math.sqrt(dx * dx + dy * dy);
          }
          let best = Infinity;
          for (let i = 1; i < pts.length; i++) {
            const dist = pointSegmentDistance(
              world.x, world.y,
              pts[i - 1].x, pts[i - 1].y,
              pts[i].x, pts[i].y,
            );
            if (dist < best) best = dist;
          }
          return best;
        }
        case 'rect': {
          // Two-point primitive: stroked rectangle. Distance is to the
          // nearest edge (4 segments of the perimeter). Filled-rect
          // semantics aren't used — drawings are stroked outlines —
          // so interior clicks should NOT erase.
          if (pts.length < 2) return Infinity;
          const x1 = Math.min(pts[0].x, pts[1].x);
          const y1 = Math.min(pts[0].y, pts[1].y);
          const x2 = Math.max(pts[0].x, pts[1].x);
          const y2 = Math.max(pts[0].y, pts[1].y);
          const dTop    = pointSegmentDistance(world.x, world.y, x1, y1, x2, y1);
          const dRight  = pointSegmentDistance(world.x, world.y, x2, y1, x2, y2);
          const dBottom = pointSegmentDistance(world.x, world.y, x1, y2, x2, y2);
          const dLeft   = pointSegmentDistance(world.x, world.y, x1, y1, x1, y2);
          return Math.min(dTop, dRight, dBottom, dLeft);
        }
        case 'circle': {
          // Two-point primitive: center + edge. Distance is |dist-radius|
          // so clicks on the stroke ring hit, interior clicks miss.
          if (pts.length < 2) return Infinity;
          const cx = pts[0].x, cy = pts[0].y;
          const dx = pts[1].x - cx, dy = pts[1].y - cy;
          const radius = Math.sqrt(dx * dx + dy * dy);
          const ddx = world.x - cx, ddy = world.y - cy;
          const distFromCenter = Math.sqrt(ddx * ddx + ddy * ddy);
          return Math.abs(distFromCenter - radius);
        }
        default:
          return Infinity;
      }
    }

    function findDrawingAt(world: { x: number; y: number }): { drawing: SceneDrawing; dist: number } | null {
      // Iterate the live store (not Pixi children) so the test is
      // independent of render order and uses real geometry data.
      // The eraser's "frontmost wins" tiebreaker matters only on
      // genuine overlaps; we resolve it via lowest-distance instead,
      // which feels right when two shapes are equally close (the one
      // whose stroke is exactly under the cursor wins).
      const all = Object.values(useBattleMapStore.getState().drawings);
      let best: { drawing: SceneDrawing; dist: number } | null = null;
      for (const d of all) {
        if (d.sceneId !== currentSceneId) continue;
        const dist = distanceToDrawing(world, d);
        // Hit threshold: stroke half-width + 6px tolerance band.
        // The band keeps thin 1-2px lines reachable even when the
        // user clicks 4-5px off-center, matching the v2.269 pad.
        const threshold = (d.lineWidth ?? 2) / 2 + 6;
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { drawing: d, dist };
        }
      }
      return best;
    }

    // v2.287.0 — Walls are now eraser-targets too. Previously the
    // eraser only handled scene_drawings; users had to switch to wall
    // mode and right-click to delete a wall. Now eraser mode treats
    // walls and drawings as one pool — the closer hit wins. Threshold
    // mirrors the wall-mode delete (max(6, gridSize*0.25)) so the
    // feel is consistent across modes.
    function findWallAt(world: { x: number; y: number }, gridSizePx: number): { wall: import('../../lib/stores/battleMapStore').Wall; dist: number } | null {
      const threshold = Math.max(6, gridSizePx * 0.25);
      let best: { wall: import('../../lib/stores/battleMapStore').Wall; dist: number } | null = null;
      for (const w of Object.values(useBattleMapStore.getState().walls)) {
        if (w.sceneId !== currentSceneId) continue;
        const dist = pointSegmentDistance(world.x, world.y, w.x1, w.y1, w.x2, w.y2);
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { wall: w, dist };
        }
      }
      return best;
    }

    function onPointerDown(e: MouseEvent) {
      if (e.button !== 0) return; // primary only
      const w = clientToWorld(e);
      if (!w) return;
      const drawingHit = findDrawingAt(w);
      // gridSizePx threshold tracks the wall-mode delete feel; falls
      // back to 50 (a reasonable default cell size in world px) if the
      // prop wasn't plumbed in for some reason.
      const gridPx = gridSizePx ?? 50;
      const wallHit = findWallAt(w, gridPx);

      // Pick the closer of the two if both hit. Drawing-only or wall-
      // only cases just use whichever is non-null.
      let target: { kind: 'drawing'; drawing: SceneDrawing } | { kind: 'wall'; wall: import('../../lib/stores/battleMapStore').Wall } | null = null;
      if (drawingHit && wallHit) {
        target = drawingHit.dist <= wallHit.dist
          ? { kind: 'drawing', drawing: drawingHit.drawing }
          : { kind: 'wall', wall: wallHit.wall };
      } else if (drawingHit) {
        target = { kind: 'drawing', drawing: drawingHit.drawing };
      } else if (wallHit) {
        target = { kind: 'wall', wall: wallHit.wall };
      }

      if (!target) {
        // Silent miss — clicking empty space in eraser mode is a no-op.
        // Adding a toast here would spam the user during normal scrub-
        // looking-for-shapes behavior.
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      if (target.kind === 'drawing') {
        const found = target.drawing;
        // Snapshot before delete so undo can restore it. Defensive deep-
        // clone of points so a later in-place mutation can't corrupt the
        // snapshot held by the undo closure.
        const snapshot = { ...found, points: found.points.map(p => ({ ...p })) };
        useBattleMapStore.getState().removeDrawing(found.id);
        drawingsApi.deleteDrawing(found.id).catch(err =>
          console.error('[DrawingLayer] eraser deleteDrawing failed', err));
        recordUndoableRef.current?.({
          label: `erase ${snapshot.kind}`,
          forward: () => {
            useBattleMapStore.getState().removeDrawing(snapshot.id);
            return drawingsApi.deleteDrawing(snapshot.id).then(() => undefined);
          },
          backward: () => {
            useBattleMapStore.getState().addDrawing(snapshot);
            return drawingsApi.createDrawing(snapshot).then(() => undefined);
          },
        });
      } else {
        // Wall delete + undo. createWall writes a fresh row using the
        // same id, which is fine — Postgres will accept it because we
        // deleted the prior row first. The store's addWall/removeWall
        // are idempotent on re-execution.
        const wall = target.wall;
        const snapshot = { ...wall };
        useBattleMapStore.getState().removeWall(wall.id);
        wallsApi.deleteWall(wall.id).catch(err =>
          console.error('[DrawingLayer] eraser deleteWall failed', err));
        recordUndoableRef.current?.({
          label: 'erase wall',
          forward: () => {
            useBattleMapStore.getState().removeWall(snapshot.id);
            return wallsApi.deleteWall(snapshot.id).then(() => undefined);
          },
          backward: () => {
            useBattleMapStore.getState().addWall(snapshot);
            return wallsApi.createWall(snapshot).then(() => undefined);
          },
        });
      }
    }

    canvasEl.addEventListener('pointerdown', onPointerDown);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
    };
  }, [eraserActive, canvasEl, viewport, isDM, currentSceneId, gridSizePx]);

  return null;
}

/**
 * v2.236.0 — FxLayer.
 *
 * Renders ephemeral particle effects (fire, lightning, sparkles,
 * smoke) on the map. Effects DO NOT persist — they animate for
 * 0.5–2.3 seconds and disappear. Cross-client visibility is achieved
 * via a Supabase Realtime broadcast channel; no schema involved.
 *
 * Architecture:
 *   - Effects live in a ref (not React state) so the rAF animation
 *     loop doesn't trigger re-renders on every frame.
 *   - One Graphics instance is reused for all effects per frame; we
 *     clear() and redraw each frame from the active effects list.
 *   - Each effect has a list of FxParticle objects with their own
 *     position, velocity, lifetime. update() advances ages; draw()
 *     renders shapes based on the effect kind.
 *   - Lightning is a special case: instead of N particles, it has
 *     one cached jagged-bolt path generated at spawn (so the bolt
 *     doesn't flicker frame-to-frame).
 *   - The trigger callback is exposed to the parent through a
 *     mutable ref. Parent calls triggerRef.current(kind, x, y) on
 *     a click to fire an effect locally + broadcast it. Realtime
 *     subscribers receive the broadcast and trigger locally too.
 */

type FxKind = 'fire' | 'lightning' | 'sparkles' | 'smoke';

interface FxParticle {
  x: number;
  y: number;
  /** velocity in px per ms */
  vx: number;
  vy: number;
  /** total lifetime in ms */
  life: number;
  /** current age in ms */
  age: number;
  color: number;
  size: number;
}

interface FxEffect {
  id: number;
  kind: FxKind;
  originX: number;
  originY: number;
  particles: FxParticle[];
  /** For lightning: cached bolt vertices so they don't re-randomize per frame. */
  boltPath?: Array<{ x: number; y: number }>;
  /** Total time after which the effect is considered done (any particles
   *  past this are reaped). */
  totalLife: number;
}

// v2.256.0 — intensity is a multiplier (0.25–2.0) that scales the
// particle count for fire/sparkles/smoke. Lightning ignores it (one
// bolt is one bolt). Default 1.0 preserves the v2.236 behavior so
// existing callers don't need to thread the value through.
function spawnFxEffect(kind: FxKind, x: number, y: number, intensity = 1): FxEffect {
  const id = Date.now() + Math.random();
  const particles: FxParticle[] = [];
  let totalLife = 1500;
  let boltPath: Array<{ x: number; y: number }> | undefined;
  // Clamp + round so a slider at 0.25 still spawns a few particles
  // (otherwise CR-low effects look broken). Floor of 4 per kind.
  const scaled = (base: number) => Math.max(4, Math.round(base * intensity));

  if (kind === 'fire') {
    // Orange/red embers rising upward with horizontal jitter.
    const palette = [0xfbbf24, 0xf97316, 0xef4444];
    for (let i = 0; i < scaled(30); i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      const speed = 0.04 + Math.random() * 0.06;
      particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 900 + Math.random() * 600,
        age: 0,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 6 + Math.random() * 7,
      });
    }
    totalLife = 1600;
  } else if (kind === 'sparkles') {
    // Yellow/gold/white twinkles fanning outward.
    const palette = [0xfbbf24, 0xfde047, 0xffffff];
    for (let i = 0; i < scaled(22); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.05 + Math.random() * 0.08;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 600 + Math.random() * 400,
        age: 0,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 3 + Math.random() * 4,
      });
    }
    totalLife = 1100;
  } else if (kind === 'smoke') {
    // Gray puffs rising slowly, expanding.
    const palette = [0x6b7280, 0x9ca3af, 0x4b5563];
    for (let i = 0; i < scaled(16); i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      const speed = 0.018 + Math.random() * 0.025;
      particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1500 + Math.random() * 800,
        age: 0,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 9 + Math.random() * 8,
      });
    }
    totalLife = 2400;
  } else {
    // Lightning — one bolt with a flash. Single placeholder particle
    // owns the lifetime; rendering uses boltPath instead of particle xy.
    const startX = x + (Math.random() - 0.5) * 50;
    const startY = y - 220 - Math.random() * 80;
    const segments = 7;
    boltPath = [{ x: startX, y: startY }];
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const baseX = startX + (x - startX) * t;
      const baseY = startY + (y - startY) * t;
      // Jitter is largest mid-bolt, zero at endpoints.
      const fade = 1 - Math.abs(t - 0.5) * 2;
      const jitter = (Math.random() - 0.5) * 36 * fade;
      boltPath.push({ x: baseX + jitter, y: baseY });
    }
    particles.push({
      x, y, vx: 0, vy: 0,
      life: 500, age: 0, color: 0xffffff, size: 0,
    });
    totalLife = 500;
  }

  return { id, kind, originX: x, originY: y, particles, boltPath, totalLife };
}

/** Returns true if the effect still has any live particles. Mutates
 *  particle positions/ages in place. */
function updateFxEffect(eff: FxEffect, dtMs: number): boolean {
  let alive = false;
  for (const p of eff.particles) {
    p.age += dtMs;
    if (p.age < p.life) {
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      // A tiny bit of upward drag for fire (counter-decelerate).
      if (eff.kind === 'fire') {
        p.vy *= 0.998;
      }
      // Sparkles drift slightly down over time.
      if (eff.kind === 'sparkles') {
        p.vy += 0.00006 * dtMs;
      }
      alive = true;
    }
  }
  return alive;
}

/** Render an effect into `g`. Caller is expected to have called
 *  g.clear() before iterating effects, and to call g.stroke()/fill()
 *  per-shape as we do here. */
function drawFxEffect(g: Graphics, eff: FxEffect) {
  if (eff.kind === 'lightning') {
    const p = eff.particles[0];
    if (!p || p.age >= p.life || !eff.boltPath) return;
    const t = p.age / p.life;
    const alpha = 1 - t;
    // Outer glow stroke (wider, softer).
    g.setStrokeStyle({ width: 8, color: 0x60a5fa, alpha: alpha * 0.45, alignment: 0.5 });
    g.moveTo(eff.boltPath[0].x, eff.boltPath[0].y);
    for (let i = 1; i < eff.boltPath.length; i++) {
      g.lineTo(eff.boltPath[i].x, eff.boltPath[i].y);
    }
    g.stroke();
    // Core white stroke.
    g.setStrokeStyle({ width: 2.5, color: 0xffffff, alpha: alpha * 0.95, alignment: 0.5 });
    g.moveTo(eff.boltPath[0].x, eff.boltPath[0].y);
    for (let i = 1; i < eff.boltPath.length; i++) {
      g.lineTo(eff.boltPath[i].x, eff.boltPath[i].y);
    }
    g.stroke();
    // Impact flash circle.
    const flash = Math.max(0, 1 - t * 1.8);
    if (flash > 0) {
      g.circle(eff.originX, eff.originY, 60 * flash)
        .fill({ color: 0xffffff, alpha: flash * 0.35 });
    }
    return;
  }

  for (const p of eff.particles) {
    if (p.age >= p.life) continue;
    const t = p.age / p.life;
    const alpha = 1 - t;
    if (eff.kind === 'sparkles') {
      const twinkle = 0.55 + 0.45 * Math.sin(p.age * 0.045);
      g.circle(p.x, p.y, p.size * (1 - t * 0.4))
        .fill({ color: p.color, alpha: alpha * twinkle });
    } else if (eff.kind === 'smoke') {
      // Smoke expands as it ages.
      g.circle(p.x, p.y, p.size * (1 + t * 0.7))
        .fill({ color: p.color, alpha: alpha * 0.55 });
    } else {
      // Fire: shrinks slightly, fades.
      g.circle(p.x, p.y, p.size * (1 - t * 0.5))
        .fill({ color: p.color, alpha: alpha * 0.85 });
    }
  }
}

function FxLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  /** Which FX kind is active, or null when no FX tool selected. */
  activeKind: FxKind | null;
  campaignId: string;
  currentSceneId: string | null;
  /** Parent sets a function on this ref so it can imperatively trigger
   *  effects from anywhere (currently used by the canvas click handler
   *  installed inside this component, but kept ref-shaped for future
   *  use — e.g. attack pipeline hits → spawn fire on impact). */
  triggerRef: React.MutableRefObject<((kind: FxKind, x: number, y: number) => void) | null>;
  /** v2.256.0 — particle-count multiplier (0.25–2.0). 1.0 = legacy
   *  v2.236 behavior. Lightning ignores this (one bolt is one bolt). */
  intensity?: number;
}) {
  const { viewport, canvasEl, activeKind, campaignId, currentSceneId, triggerRef, intensity = 1 } = props;
  const gfxRef = useRef<Graphics | null>(null);
  const effectsRef = useRef<FxEffect[]>([]);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeKindRef = useRef<FxKind | null>(null);
  useEffect(() => { activeKindRef.current = activeKind; }, [activeKind]);
  // v2.256.0 — mirror intensity into a ref so the click/realtime
  // handlers attached in the mount effect can read the latest value
  // without re-binding on every slider change.
  const intensityRef = useRef(intensity);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  // Mount Graphics + start animation loop once per viewport.
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    gfxRef.current = g;
    viewport.addChild(g);

    function tick(now: number) {
      const last = lastTimeRef.current || now;
      const dt = Math.min(64, now - last); // clamp to avoid huge dt on tab refocus
      lastTimeRef.current = now;
      const gfx = gfxRef.current;
      if (gfx) {
        gfx.clear();
        const live: FxEffect[] = [];
        for (const eff of effectsRef.current) {
          const alive = updateFxEffect(eff, dt);
          if (alive) {
            drawFxEffect(gfx, eff);
            live.push(eff);
          }
        }
        effectsRef.current = live;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { viewport.removeChild(g); } catch { /* viewport gone */ }
      try { g.destroy(); } catch { /* destroyed */ }
      gfxRef.current = null;
      effectsRef.current = [];
      lastTimeRef.current = 0;
    };
  }, [viewport]);

  // Realtime broadcast channel — both subscribe (for remote effects)
  // and send (for our own effects). Channel name is scene-scoped so
  // FX in one scene don't leak to viewers of another.
  useEffect(() => {
    if (!currentSceneId || !campaignId) return;
    const channel = supabase
      .channel(`battle_map:fx:${currentSceneId}`)
      .on('broadcast', { event: 'fx' }, (msg: any) => {
        const payload = msg?.payload ?? {};
        const kind = payload.kind as FxKind | undefined;
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!kind || !Number.isFinite(x) || !Number.isFinite(y)) return;
        if (kind !== 'fire' && kind !== 'lightning' && kind !== 'sparkles' && kind !== 'smoke') return;
        // v2.256.0 — accept intensity from the broadcast so remote
        // viewers see the same density the caster picked. Falls back
        // to 1.0 for messages from older clients (no schema bump).
        const remoteIntensity = Number.isFinite(Number(payload.intensity))
          ? Number(payload.intensity) : 1;
        // Spawn locally — no broadcast back (Supabase broadcast does
        // not echo to sender, and we don't want a loop anyway).
        effectsRef.current.push(spawnFxEffect(kind, x, y, remoteIntensity));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [currentSceneId, campaignId]);

  // Expose trigger to parent. Spawning an FX = local push + broadcast.
  useEffect(() => {
    triggerRef.current = (kind: FxKind, x: number, y: number) => {
      // v2.256.0 — read the live intensity from the ref so a slider
      // change between mount and click is honored without re-binding.
      const i = intensityRef.current;
      effectsRef.current.push(spawnFxEffect(kind, x, y, i));
      const ch = channelRef.current;
      if (ch) {
        ch.send({
          type: 'broadcast',
          event: 'fx',
          payload: { kind, x, y, intensity: i },
        }).catch(() => { /* fire-and-forget */ });
      }
    };
    return () => { triggerRef.current = null; };
  }, [triggerRef]);

  // Canvas click handler — only attached when an FX kind is active.
  useEffect(() => {
    if (!activeKind || !canvasEl || !viewport || !currentSceneId) return;
    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;
      const fn = triggerRef.current;
      const kind = activeKindRef.current;
      if (!fn || !kind) return;
      fn(kind, w.x, w.y);
    }
    canvasEl.addEventListener('click', onClick);
    return () => {
      canvasEl.removeEventListener('click', onClick);
    };
  }, [activeKind, canvasEl, viewport, currentSceneId, triggerRef]);

  return null;
}

function TokenLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  onContextMenu: (state: ContextMenuState) => void;
  worldWidth: number;
  worldHeight: number;
  gridSizePx: number;
  // v2.216 — Realtime drag callbacks + identity.
  currentUserId: string;
  onDragStart?: (tokenId: string) => void;
  onDragMove?: (tokenId: string, x: number, y: number) => void;
  onDragEnd?: (tokenId: string) => void;
  // v2.218 — when the ruler is active, ALL token interactions are
  // suppressed so the ruler gesture owns the pointer exclusively.
  rulerActive?: boolean;
  // v2.223 — same pattern for wall-drawing mode.
  wallActive?: boolean;
  // v2.234 — same pattern for text annotation mode. When active, all
  // pointer events on tokens bail out so the TextLayer's click handler
  // can place / edit text without competing.
  textActive?: boolean;
  // v2.235 — same pattern for any drawing tool (pencil/line/rect/circle).
  // The DrawingLayer captures pointer events on the canvas; tokens
  // must yield so the user can drag through their position to draw.
  drawActive?: boolean;
  // v2.236 — same pattern for FX particle mode. FxLayer captures
  // single-clicks to spawn effects; tokens yield so drag-through
  // and click-on-token don't compete with effect placement.
  fxActive?: boolean;
  // v2.269.0 — same pattern for the eraser tool. DrawingLayer owns
  // the click handler in this mode (resolves to a delete-drawing
  // operation), so tokens must yield so a click on a drawing
  // overlapping a token still erases the drawing instead of
  // selecting/dragging the token.
  eraserActive?: boolean;
  // v2.221 — character HP lookup for live HP bars on PC tokens.
  // Map<characterId, { current, max }>. Tokens whose characterId
  // matches an entry get an HP bar rendered underneath. Pure data
  // flow — store does not own this; it's derived from the
  // playerCharacters prop on every render.
  characterHpMap?: Map<string, { current: number; max: number }>;
  // v2.244 — NPC HP lookup for HP bars on roster-spawned tokens.
  // Mirrors characterHpMap but keyed by npcId. NPC bar visibility
  // differs: bars hide at full HP and only appear once damage has
  // been dealt (keeps the canvas clean during pre-combat setup).
  npcHpMap?: Map<string, { current: number; max: number }>;
  // v2.393.0 — Per-token state map. See parent prop docs.
  tokenStateMap?: Map<string, {
    current_hp: number | null;
    max_hp: number | null;
    conditions: string[];
    is_dead: boolean;
  }>;
  // v2.244 — condition strip lookup. Keyed by token.id (NOT character/
  // npc id) so the renderer doesn't have to branch. CampaignDashboard +
  // BattleMapV2 build it by walking tokens and resolving each linked
  // PC or NPC. Tokens not in the map render no strip.
  tokenConditionsMap?: Map<string, string[]>;
  // v2.226 — left-click-without-drag opens the token quick-info panel.
  // Fires only after the user releases the pointer with negligible
  // movement (and the token wasn't dragged). Receives world-screen
  // coordinates so the parent can place the panel near the token.
  onTokenClick?: (tokenId: string, screenX: number, screenY: number) => void;
  // v2.268.0 — fired when a drop is rejected because the path crosses
  // a movement-blocking wall. The parent shows a toast; TokenLayer
  // doesn't import the toast hook directly so it stays test-friendly
  // (rendering this layer in isolation doesn't need a ToastProvider).
  onMovementBlocked?: () => void;
  // v2.282 — when true, hidden tokens (visibleToAll=false) render at
  // reduced alpha so the DM can see at a glance which tokens haven't
  // been revealed to players yet. Players never get hidden tokens
  // (RLS strips them at SELECT), so the alpha cue only ever applies
  // on the DM surface — players would never see a faded token.
  isDM?: boolean;
  // v2.396.0 — Player viewer's own PC id. Used to gate HP-bar render:
  // players see HP bars only on their own character; everyone else's
  // HP (party members, NPCs, creatures) is hidden so the table can't
  // meta-game off the bar fill levels. DM ignores this and sees all.
  myCharacterId?: string | null;
  // v2.358.0 — DM-only token-move undo. Pre-v2.358 useUndoRedo
  // explicitly excluded tokens because of multi-user drag races,
  // but DM-only undo on the DM's own token moves is safe — only one
  // user is moving the token. Player tokens still don't record (the
  // commit path checks isDM before calling this).
  recordUndoable?: (action: import('../../lib/hooks/useUndoRedo').UndoableAction) => void;
  // v2.358.0 — Token id currently selected by left-click. TokenLayer
  // renders a thin cyan ring around this token to indicate selection.
  // Distinct from activeTokenInfo.tokenId (gold ring, driven by
  // initiative) — both can be visible simultaneously when the DM
  // selects a non-active token.
  selectedTokenId?: string | null;
  // v2.339.0 — BG3 turn UX. When combat is active, this carries the
  // token id of the participant whose turn it is + their movement
  // budget so the renderer can stamp a gold pulse outline + an
  // "Xft / Yft" badge above the matching token. Null token id means
  // either no combat OR the active actor isn't placed on this scene.
  // v2.340.0 — extended with participant identity + campaign/encounter
  // ids so the drag handler can invoke canMove() + logMovement() on
  // drop. All four added fields are null when there's no active
  // combat, which is the gate the drag handler uses to decide whether
  // to enforce movement at all.
  // v2.341.0 — extended with action/bonus/reaction booleans so the
  // renderer can stamp the three-pip economy indicator on the active
  // token. Pips render gold-filled when available, dimmed dark when
  // consumed; toggle source-of-truth lives on combat_participants.
  activeTokenInfo?: {
    tokenId: string | null;
    used: number;
    max: number;
    dashed: boolean;
    participantId: string | null;
    participantName: string | null;
    participantType: 'character' | 'npc' | 'monster' | null;
    encounterId: string | null;
    campaignId: string | null;
    actionUsed: boolean;
    bonusUsed: boolean;
    reactionUsed: boolean;
    // v2.403.0 — entity_id of the currently-active actor. Used for
    // the fallback match in onPointerUp's enforcement gate when
    // activeTokenInfo.tokenId picked the wrong instance among
    // multiple same-creature tokens.
    participantEntityId: string | null;
  };
}) {
  const {
    viewport, canvasEl, onContextMenu, worldWidth, worldHeight, gridSizePx,
    currentUserId, onDragStart, onDragMove, onDragEnd, rulerActive, wallActive,
    textActive, drawActive, fxActive, eraserActive, characterHpMap, npcHpMap, tokenStateMap, tokenConditionsMap,
    onTokenClick, onMovementBlocked, isDM, myCharacterId, activeTokenInfo,
    recordUndoable, selectedTokenId,
  } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const updatePos = useBattleMapStore(s => s.updateTokenPosition);
  const setDragging = useBattleMapStore(s => s.setDragging);
  const remoteDragLocks = useBattleMapStore(s => s.remoteDragLocks);

  // v2.358.0 — recordUndoable mirrored into a ref so the drag-end
  // closure (attached once per token at mount) can read the latest
  // value without re-wiring listeners. Same pattern as ruler/wall/etc.
  const recordUndoableRef = useRef(recordUndoable);
  useEffect(() => { recordUndoableRef.current = recordUndoable; }, [recordUndoable]);

  // v2.218: pointerdown is attached once per token; to read the
  // current rulerActive value without re-wiring listeners, mirror it
  // into a ref that updates every render.
  const rulerActiveRef = useRef(false);
  useEffect(() => { rulerActiveRef.current = !!rulerActive; }, [rulerActive]);
  // v2.223: same mechanism for wall-drawing mode.
  const wallActiveRef = useRef(false);
  useEffect(() => { wallActiveRef.current = !!wallActive; }, [wallActive]);
  // v2.234: same mechanism for text annotation mode.
  const textActiveRef = useRef(false);
  useEffect(() => { textActiveRef.current = !!textActive; }, [textActive]);
  // v2.235: same mechanism for any active drawing tool.
  const drawActiveRef = useRef(false);
  useEffect(() => { drawActiveRef.current = !!drawActive; }, [drawActive]);
  // v2.236: same mechanism for FX particle mode.
  const fxActiveRef = useRef(false);
  useEffect(() => { fxActiveRef.current = !!fxActive; }, [fxActive]);
  // v2.269.0: same mechanism for eraser mode.
  const eraserActiveRef = useRef(false);
  useEffect(() => { eraserActiveRef.current = !!eraserActive; }, [eraserActive]);
  // v2.340.0: same pattern for activeTokenInfo. The drag handler
  // attaches listeners once at mount; without a ref the closure
  // would capture the FIRST activeTokenInfo (likely null) and never
  // see turn changes. The ref keeps the closure reading the latest
  // value at drag-move and drop time.
  const activeTokenInfoRef = useRef(activeTokenInfo);
  useEffect(() => { activeTokenInfoRef.current = activeTokenInfo; }, [activeTokenInfo]);
  // v2.411.0: same ref pattern for isDM + myCharacterId. The
  // pointerdown handler is a stable closure attached once per token,
  // so it can't read the live React-prop values directly. The player
  // ownership gate (only the owning player may drag a player-linked
  // token; DM may drag anything) needs both to be current at the
  // moment of pointerdown.
  const isDMRef = useRef(isDM);
  useEffect(() => { isDMRef.current = isDM; }, [isDM]);
  const myCharacterIdRef = useRef(myCharacterId);
  useEffect(() => { myCharacterIdRef.current = myCharacterId; }, [myCharacterId]);

  interface TokenGfx {
    container: Container;
    circle: Graphics;
    initials: Text;
    // v2.215: sprite + mask. Added lazily when a portrait loads.
    sprite: Sprite | null;
    mask: Graphics | null;
    currentPath: string | null;
    loadGen: number;
    // v2.216: lock indicator ring. Added as a top-most child when a
    // remote user is dragging this token. Kept separate from `circle`
    // so we can toggle its visibility cheaply without redraws.
    lockRing: Graphics | null;
    // v2.221: HP bar — a thin pill rendered under the token when the
    // token is linked to a known character. Lazily created on first
    // bar draw, redrawn when HP values change. null if the token has
    // no characterId or the linked character isn't in characterHpMap.
    hpBar: Graphics | null;
    // v2.226: name label rendered below the token + HP bar so DMs can
    // read which token is which without relying on initials. Lazy
    // create on first draw; updated on token.name change.
    nameLabel: Text | null;
    // v2.244 — dead-state visuals. When current_hp <= 0, we apply a
    // grayscale ColorMatrixFilter to the container (washes out the
    // sprite/initials/HP bar uniformly) and overlay a red ✖. Filter is
    // attached/removed at the container level rather than rebuilt each
    // tick — toggling is cheap. The ✖ is a Graphics with two strokes.
    deadFilter: ColorMatrixFilter | null;
    deadX: Graphics | null;
    // v2.391.0 — Strikethrough line over the name label when the
    // token is dead. PIXI Text doesn't support CSS-style line-through,
    // so we draw a thin red Graphics line across the label's width.
    // Sized + positioned each reconcile so it tracks label width and
    // position changes (e.g., HP bar visibility shifting label down).
    nameStrike: Graphics | null;
    // v2.244 — condition icon strip below the name label. One Container
    // owning N child icons (Graphics-backed circle + Text glyph). We
    // tear it down + rebuild on conditions change rather than diff
    // child-by-child; conditions are rare and the cost is trivial.
    conditionsLayer: Container | null;
    // v2.339.0 — BG3 turn UX overlays. Both null until first activation
    // (token isn't the active turn) — we lazily create on first need
    // and toggle .visible thereafter. Removing/re-adding Pixi children
    // is more expensive than visibility toggles, and active-turn flips
    // every few seconds during combat.
    //   • turnRing: gold outline graphics, sibling of `circle`. Pulses
    //     via the same rAF loop that drives lockRing.
    //   • movementBadge: Text node above the token showing "Xft/Yft"
    //     with a small backing pill (movementBadgeBg) for legibility
    //     against any map background.
    turnRing: Graphics | null;
    movementBadge: Text | null;
    movementBadgeBg: Graphics | null;
    // v2.358.0 — Selection ring. Thin cyan outline rendered when the
    // token is the user's currently-selected token (left-click select,
    // not initiative). Lazy-created like turnRing/movementBadge —
    // null until the token first becomes selected, .visible toggled
    // thereafter.
    selectionRing: Graphics | null;
    // v2.341.0 — Action / Bonus / Reaction pip indicators. A small
    // 3-dot strip rendered just below the movement badge above the
    // active token. Each pip is a Graphics circle: gold-filled when
    // available, dim-charcoal when consumed. Letters A / B / R sit
    // inside via a single Text per pip. We keep them as a Container
    // so we can toggle .visible at the group level cheaply, and
    // mutate child fills in place for cheap per-frame updates.
    economyPipsLayer: Container | null;
    economyPipsRefs: Array<{ dot: Graphics; glyph: Text; key: 'A' | 'B' | 'R' }> | null;
    // v2.411.0 — Outer halo ring for the active-turn pulse. Sits at
    // r + 8 with low alpha (0.3) so the inner turnRing reads as the
    // primary signal while the halo gives a softer "active" glow.
    // Lazily created on first activation, toggled .visible afterwards.
    // Same per-frame pulse + rotation as turnRing; we rotate the
    // halo's container so the dashed/segmented stroke pattern (drawn
    // once at create time) appears to spin.
    turnHaloRing: Graphics | null;
    // v2.411.0 — Padlock glyph rendered above any locked token (a
    // token with isLocked=true). Lazy-created on first lock event,
    // visibility toggles thereafter. Position mirrors movement badge
    // offset (-(r + 18)) but shifted right of center so the badge
    // doesn't collide when both are present (active turn AND locked
    // is rare but possible on a DM-controlled creature mid-combat).
    lockGlyph: Text | null;
  }
  const gfxMapRef = useRef<Map<string, TokenGfx>>(new Map());
  // v2.268.0 — added originX/originY so the drop handler can validate
  // movement against blocking walls (segment from origin → snapped
  // drop point shouldn't intersect any wall with blocksMovement=true).
  // Captured at drag start; never mutated during the drag.
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; originX: number; originY: number } | null>(null);

  // v2.256.0 — Lock-ring pulse animation. A single rAF walks every
  // active TokenGfx and breathes the lockRing's alpha+scale. Cheaper
  // than redrawing the ring geometry every frame (we only mutate
  // transform fields). The ring's geometry is set once when it's
  // attached (in the per-token reconcile below); this loop just
  // animates its top-level transform.
  //
  // Period: ~1200ms full breath. Math.sin keeps the easing smooth at
  // the endpoints. Range: alpha 0.55 → 1.0, scale 1.0 → 1.08 — small
  // enough to read as "alive" without hijacking attention from the
  // moving token.
  //
  // v2.385.0 — Same loop now also pulses turnRing on the active-turn
  // token. The turn-ring comment in the per-token reconcile block
  // promised this back in v2.339 but the pulse was never wired.
  // Slower period (1800ms — the user described it as "flashing
  // yellow slowly almost pulsing") and a tighter alpha range so the
  // gold halo reads as alive without distracting from action. No
  // scale change on the turn ring — its purpose is to mark the
  // ACTIVE TOKEN, and zooming the ring would compete with the
  // movement-spent visual feedback.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      // Lock ring (v2.256): 1.2s breath, alpha + scale.
      const lockT = elapsed / 1200;
      const lockPhase = (Math.sin(lockT * Math.PI * 2) + 1) / 2; // 0..1
      const lockAlpha = 0.55 + lockPhase * 0.45;
      const lockScale = 1 + lockPhase * 0.08;
      // Turn ring (v2.385): 1.8s breath, alpha only.
      // v2.411.0 — add slow rotation. We rotate the inner turnRing
      // around its center; the halo (v2.411 outer ring) rotates the
      // opposite direction so the two-ring system reads as alive.
      // Rotation rate is small (~0.4 rad/sec) to match the "almost
      // pulsing" pace of the alpha breath without becoming
      // distracting. We do NOT rotate the container — only the ring
      // graphics so other children (HP bar, name, badges) stay put.
      const turnT = elapsed / 1800;
      const turnPhase = (Math.sin(turnT * Math.PI * 2) + 1) / 2;
      const turnAlpha = 0.6 + turnPhase * 0.4;
      const haloAlpha = 0.18 + turnPhase * 0.22; // 0.18..0.40
      const turnRotation = (elapsed / 1000) * 0.4;     // CW
      const haloRotation = -(elapsed / 1000) * 0.25;   // CCW, slower
      for (const entry of gfxMapRef.current.values()) {
        const lock = entry.lockRing;
        if (lock && !lock.destroyed) {
          lock.alpha = lockAlpha;
          lock.scale.set(lockScale);
        }
        const turn = entry.turnRing;
        // Only pulse when visible; the per-token reconcile flips
        // .visible to false when the token isn't the active turn.
        if (turn && !turn.destroyed && turn.visible) {
          turn.alpha = turnAlpha;
          turn.rotation = turnRotation;
        }
        // v2.411.0 — outer halo: same visibility check, opposite-
        // direction rotation, lower alpha range.
        const halo = entry.turnHaloRing;
        if (halo && !halo.destroyed && halo.visible) {
          halo.alpha = haloAlpha;
          halo.rotation = haloRotation;
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // v2.226 — track pointerdown screen pos + timestamp to distinguish
  // "click" (no drag) from "drag commit" on pointerup.
  const clickProbeRef = useRef<{
    id: string;
    downClientX: number;
    downClientY: number;
    downAtMs: number;
    didMove: boolean;
  } | null>(null);

  const layerContainerRef = useRef<Container | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const c = new Container();
    viewport.addChild(c);
    layerContainerRef.current = c;
    return () => {
      if (viewport && !viewport.destroyed) viewport.removeChild(c);
      c.destroy({ children: true });
      layerContainerRef.current = null;
      gfxMapRef.current.clear();
    };
  }, [viewport]);

  useEffect(() => {
    const layer = layerContainerRef.current;
    if (!layer || !viewport) return;
    const gfxMap = gfxMapRef.current;

    for (const [id, entry] of gfxMap) {
      if (!tokens[id]) {
        layer.removeChild(entry.container);
        entry.container.destroy({ children: true });
        gfxMap.delete(id);
      }
    }

    for (const token of Object.values(tokens)) {
      let entry = gfxMap.get(token.id);
      const isNew = !entry;
      if (isNew) {
        const container = new Container();
        container.eventMode = 'static';
        container.cursor = 'grab';
        const circle = new Graphics();
        const initials = new Text({
          text: tokenInitials(token.name),
          style: new TextStyle({
            fontFamily: 'sans-serif',
            fontWeight: '700',
            fontSize: 20,
            fill: 0xffffff,
            align: 'center',
            stroke: { color: 0x0f1012, width: 3 },
          }),
        });
        initials.anchor.set(0.5, 0.5);
        container.addChild(circle);
        container.addChild(initials);
        layer.addChild(container);
        entry = {
          container, circle, initials,
          sprite: null, mask: null, currentPath: null, loadGen: 0,
          lockRing: null,
          hpBar: null,
          nameLabel: null,
          deadFilter: null,
          deadX: null,
          nameStrike: null,
          conditionsLayer: null,
          turnRing: null,
          movementBadge: null,
          movementBadgeBg: null,
          selectionRing: null,
          economyPipsLayer: null,
          economyPipsRefs: null,
          // v2.411.0
          turnHaloRing: null,
          lockGlyph: null,
        };
        gfxMap.set(token.id, entry);

        (container as any).__tokenId = token.id;
        container.on('pointerdown', (event: FederatedPointerEvent) => {
          if (!viewport) return;
          // v2.218: when ruler is active, ignore all token pointer events
          // so the ruler gesture owns the canvas. Don't stopPropagation
          // here — the window-level pointerdown in RulerLayer needs to
          // see the event.
          if (rulerActiveRef.current) return;
          // v2.223: same for wall-drawing mode.
          if (wallActiveRef.current) return;
          // v2.234: same for text annotation mode.
          if (textActiveRef.current) return;
          // v2.235: same for any drawing tool (pencil/line/rect/circle).
          if (drawActiveRef.current) return;
          // v2.236: same for FX particle mode.
          if (fxActiveRef.current) return;
          // v2.269.0: same for eraser mode. DrawingLayer captures the
          // click; tokens yield so a click on a drawing overlapping a
          // token erases the drawing instead of grabbing the token.
          if (eraserActiveRef.current) return;
          if (event.button === 2) {
            event.stopPropagation();
            event.preventDefault();
            const tid = (container as any).__tokenId as string;
            // v2.362.0 — Read viewport-relative clientX from the
            // underlying DOM PointerEvent (event.nativeEvent). This
            // IS viewport-relative (DOM convention) and is what
            // position:fixed expects. Pre-v2.360 used this same
            // path; v2.360 wrongly switched to event.clientX (Pixi
            // canvas-relative); v2.361 wrongly tried event.global +
            // canvas rect (event.global is world-space, not canvas-
            // pixel-space). Back to the original path. The actual
            // bug (menu rendering far off) was that the menu's
            // position:fixed was being trapped by an animate-fade-
            // in transform ancestor — fixed via createPortal in
            // TokenContextMenu's return.
            const oe = event.nativeEvent as MouseEvent | PointerEvent;
            onContextMenu({
              tokenId: tid,
              clientX: oe.clientX,
              clientY: oe.clientY,
            });
            return;
          }
          if (event.button !== 0) return;
          event.stopPropagation();
          const tid = (container as any).__tokenId as string;
          // v2.216: refuse to start drag if a different user is
          // currently dragging this token (stale lock from their
          // in-flight drag). Silently ignore the press — no toast yet.
          const locks = useBattleMapStore.getState().remoteDragLocks;
          if (locks[tid] && locks[tid] !== currentUserId) {
            return;
          }
          const t = useBattleMapStore.getState().tokens[tid];
          if (!t) return;
          // v2.412.0 — Lock check with active-turn bypass.
          //
          // Tokens default LOCKED (v2.412 default flip). The lock
          // makes a token immobile EXCEPT during its own active turn,
          // and only while it still has movement remaining. Once
          // movement is exhausted the lock re-engages and the token
          // is stuck — at that point the DM/player can press the
          // Reset Movement button on InitiativeStrip /
          // MonsterActionPanel to refund movement, or the DM can
          // unlock the token entirely via the context menu.
          //
          // Outside an active turn (no combat, between turns, or a
          // different token's turn) the lock check refuses the press
          // outright. This is intentional — the BG3-style flow only
          // wants the active actor moving during combat.
          //
          // activeTokenInfoRef holds the current activeTokenInfo
          // (the closure attaches once at token mount and would
          // otherwise capture a stale value).
          if ((t as any).isLocked) {
            const ati = activeTokenInfoRef.current;
            const isThisTokenActive = !!ati && ati.tokenId === tid;
            const movementRemaining = ati ? Math.max(0, ati.max - ati.used) : 0;
            if (!isThisTokenActive || movementRemaining <= 0) {
              return;
            }
            // else: fall through — locked token is on its own turn
            // with movement to spend, so allow the drag.
          }
          // v2.411.0 — player ownership gate. Players may only drag
          // tokens that represent their own character (token.characterId
          // matches the player's character). DM bypasses (isDMRef
          // covers it). For DM-controlled creature tokens this gate is
          // moot because they have no characterId; for PC tokens the
          // owning player passes and other players are blocked. Refs
          // are required since this closure is attached once at token
          // mount and doesn't see prop changes otherwise.
          if (!isDMRef.current) {
            const myCid = myCharacterIdRef.current;
            if (!t.characterId || t.characterId !== myCid) {
              return;
            }
          }
          const worldPoint = viewport.toWorld(event.global.x, event.global.y);
          dragRef.current = {
            id: tid,
            offsetX: worldPoint.x - t.x,
            offsetY: worldPoint.y - t.y,
            // v2.268 — remember where the token was when the drag began so
            // wall-collision validation has both endpoints of the segment.
            originX: t.x,
            originY: t.y,
          };
          // v2.226 — record click-probe state. If pointerup fires soon
          // after with negligible movement, the parent gets onTokenClick
          // instead of (or in addition to) the drag commit.
          // v2.362.0 — Read viewport-relative clientX from the
          // underlying DOM PointerEvent. The pointerup compares
          // against a DOM PointerEvent.clientX (also viewport-
          // relative), so both endpoints of the comparison must use
          // the same coord space. v2.360-2.361 attempts at "fixing"
          // this with Pixi-relative coords broke click vs drag
          // detection.
          const oeProbe = event.nativeEvent as PointerEvent;
          clickProbeRef.current = {
            id: tid,
            downClientX: oeProbe.clientX,
            downClientY: oeProbe.clientY,
            downAtMs: performance.now(),
            didMove: false,
          };
          setDragging(tid);
          container.cursor = 'grabbing';
          container.alpha = 0.75;
          // v2.216: claim the lock + notify peers.
          onDragStart?.(tid);
        });
      }
      const { container, circle, initials } = entry!;

      container.position.set(token.x, token.y);

      // v2.282 — DM-side visual cue for hidden tokens. Players never
      // get this code path (RLS strips visibleToAll=false rows from
      // their SELECT), so the dim only ever shows on the DM surface.
      // Skipped while THIS token is being dragged — the drag handler
      // imperatively sets alpha=0.75 on grab and =1 on release, and
      // we don't want to fight it mid-drag (the 0.75 dim is the v2.216
      // visual contract for "I'm holding this"). On drag-end the
      // handler resets to 1 then the very next render frame restores
      // the visibility-correct value, so there's no flash.
      const isThisDragging = dragRef.current?.id === token.id;
      if (!isThisDragging) {
        container.alpha = (isDM && !token.visibleToAll) ? 0.4 : 1;
      }

      const r = tokenRadiusForSize(token.size, gridSizePx);
      circle.clear();
      circle.setFillStyle({ color: token.color, alpha: 0.92 });
      circle.circle(0, 0, r);
      circle.fill();
      circle.setStrokeStyle({ color: 0x0f1012, width: 2, alpha: 0.9 });
      circle.circle(0, 0, r);
      circle.stroke();
      circle.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.35 });
      circle.circle(0, 0, r - 2);
      circle.stroke();

      // v2.397.0 — Click/drag area covers the FULL footprint, not just
      // the visible circle. Pre-v2.397 the container's interactive
      // bounds were derived from the circle Graphics — for a Large
      // token the visual circle has cellSpan 1.85 (radius ≈ 0.925
      // cells), so the corner cells of the 2×2 footprint were
      // outside the hit region. User reported "the click area is just
      // one box" — meaning only the anchor cell reliably grabbed the
      // token. Setting an explicit Rectangle hitArea sized to the
      // full footprint makes every cell of the footprint draggable.
      //
      // Footprint sizing & centering: we use the RAW cell count
      // (tokenFootprintCells: 1/2/3/4 for medium/large/huge/garg)
      // and center the rectangle on the anchor. For even sizes
      // (Large=2, Garg=4), centering means the anchor sits at the
      // intersection of cells, offset by half a cell from any
      // single-cell center. That matches what the visual circle
      // does today, so the click area aligns with what the user
      // sees.
      const footCells = tokenFootprintCells(token.size);
      const footPx = footCells * gridSizePx;
      // Set on container (the pointer-event target) rather than
      // circle. Container.eventMode='static' wires the events; its
      // hitArea drives where they fire. Belt-and-suspenders: also
      // cover the children with a footprint-sized hit area so any
      // future child reorder doesn't drop hits.
      container.hitArea = new Rectangle(-footPx / 2, -footPx / 2, footPx, footPx);

      // v2.398.0 — Footprint square outline for Large+ tokens. With
      // the v2.398 visual circle now inscribed in the size×size
      // footprint, the user can see the dragon fills its 3×3 area
      // — but a faint square outline around the cell boundaries
      // makes it absolutely unambiguous which cells are occupied,
      // both at rest and while dragging (the outline moves with the
      // container). Only drawn for size > 1 because Medium tokens
      // are 1 cell and the existing circle already conveys that.
      // Drawn ON the same circle Graphics so we don't add a child
      // (keeps the gfx tree small + scrubs cleanly between renders
      // because circle.clear() runs above).
      if (footCells > 1) {
        const half = footPx / 2;
        circle.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.18 });
        circle.rect(-half, -half, footPx, footPx);
        circle.stroke();
      }

      const newText = tokenInitials(token.name);
      if (initials.text !== newText) initials.text = newText;
      const targetFontSize = Math.max(11, Math.round(r * 0.75));
      if (initials.style.fontSize !== targetFontSize) {
        initials.style.fontSize = targetFontSize;
      }

      // v2.215 portrait rendering.
      //
      // Goal: when token.imageStoragePath is set and differs from the
      // path we currently have loaded, async-load the texture and on
      // success add a masked Sprite child. Keep the color+initials
      // fallback during load and on error.
      //
      // Side-effect handling in a render-reconcile is ugly but bounded:
      // we capture loadGen at kick-off and compare on resolve to ignore
      // outdated loads. The async chain is intentionally fire-and-forget
      // so the reconcile loop stays synchronous.
      const desiredPath = token.imageStoragePath;
      const currentEntry = entry!;
      if (desiredPath !== currentEntry.currentPath) {
        // Bump gen so any in-flight load becomes stale.
        currentEntry.loadGen += 1;
        const thisGen = currentEntry.loadGen;
        currentEntry.currentPath = desiredPath;

        // Clean up any previous sprite + mask — the old texture no
        // longer applies. Will re-add if/when the new one loads.
        if (currentEntry.sprite) {
          if (!currentEntry.sprite.destroyed) {
            container.removeChild(currentEntry.sprite);
            currentEntry.sprite.destroy();
          }
          currentEntry.sprite = null;
        }
        if (currentEntry.mask) {
          if (!currentEntry.mask.destroyed) {
            container.removeChild(currentEntry.mask);
            currentEntry.mask.destroy();
          }
          currentEntry.mask = null;
        }
        initials.visible = true; // fallback re-shown while loading

        if (desiredPath) {
          const url = assetsApi.getPortraitUrl(desiredPath);
          if (url) {
            // Pixi's Assets.load caches by URL so re-requesting the
            // same portrait across tokens is free after first load.
            Assets.load<Texture>(url).then(texture => {
              // If the token was removed, reassigned a new path, or
              // the container got torn down while we were loading,
              // bail silently.
              const live = gfxMapRef.current.get(token.id);
              if (!live || live.loadGen !== thisGen) return;
              if (live.container.destroyed) return;

              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              // Size the sprite to match the token circle, preserving
              // the portrait's aspect ratio (the mask crops it circular
              // regardless of source aspect).
              const { width: tw, height: th } = texture;
              const aspect = tw && th ? tw / th : 1;
              const diameter = 2 * r;
              if (aspect >= 1) {
                sprite.height = diameter;
                sprite.width = diameter * aspect;
              } else {
                sprite.width = diameter;
                sprite.height = diameter / aspect;
              }

              // Circular mask so portraits render as circle crops.
              const mask = new Graphics();
              mask.circle(0, 0, r - 1);
              mask.fill(0xffffff);
              sprite.mask = mask;

              // Insert order: mask first (so Pixi processes it), sprite
              // above the fallback circle, initials hidden (portrait is
              // identification enough). Outline circle stays on top of
              // sprite for a clean rim.
              live.container.addChild(mask);
              // Move sprite below the circle outline? Actually we want
              // circle on top so the rim shows. Pixi draw order = child
              // order. So: [circle-fill, sprite, circle-outline, initials].
              // Our circle has both fill and stroke in one Graphics,
              // so we just put the sprite after it and hide initials.
              live.container.addChildAt(sprite, live.container.getChildIndex(circle) + 1);
              live.initials.visible = false;

              live.sprite = sprite;
              live.mask = mask;
            }).catch(err => {
              // Failure path: silently fall back. Console log for
              // devs, token still renders fine with color+initials.
              console.error('[BattleMapV2] texture load failed', desiredPath, err);
            });
          }
        }
      } else if (currentEntry.sprite && !currentEntry.sprite.destroyed) {
        // Same portrait as before — just resync size (token.size may
        // have changed via context menu resize).
        const { width: tw, height: th } = currentEntry.sprite.texture;
        const aspect = tw && th ? tw / th : 1;
        const diameter = 2 * r;
        if (aspect >= 1) {
          currentEntry.sprite.height = diameter;
          currentEntry.sprite.width = diameter * aspect;
        } else {
          currentEntry.sprite.width = diameter;
          currentEntry.sprite.height = diameter / aspect;
        }
        // Redraw the mask too (r may have changed).
        if (currentEntry.mask && !currentEntry.mask.destroyed) {
          currentEntry.mask.clear();
          currentEntry.mask.circle(0, 0, r - 1);
          currentEntry.mask.fill(0xffffff);
        }
      }

      // v2.216 — lock ring for tokens being dragged by a remote user.
      // We render a thicker purple outline outside the circle so it's
      // visually distinct from the normal token rim. When the lock
      // clears (user released), we remove the ring on the next
      // reconcile cycle.
      const lockerId = remoteDragLocks[token.id];
      const shouldShowLockRing = Boolean(lockerId) && lockerId !== currentUserId;
      if (shouldShowLockRing) {
        let ring = currentEntry.lockRing;
        if (!ring || ring.destroyed) {
          ring = new Graphics();
          container.addChild(ring);
          currentEntry.lockRing = ring;
        }
        ring.clear();
        // Outer glow ring, 5px outside the token's rim.
        ring.setStrokeStyle({ color: 0xa78bfa, width: 3, alpha: 0.85 });
        ring.circle(0, 0, r + 5);
        ring.stroke();
        // Inner soft halo for emphasis.
        ring.setStrokeStyle({ color: 0xa78bfa, width: 1, alpha: 0.4 });
        ring.circle(0, 0, r + 8);
        ring.stroke();
      } else if (currentEntry.lockRing) {
        // Not locked — tear down the ring.
        if (!currentEntry.lockRing.destroyed) {
          container.removeChild(currentEntry.lockRing);
          currentEntry.lockRing.destroy();
        }
        currentEntry.lockRing = null;
      }

      // v2.221 — HP bar. Renders for tokens linked to a known PC
      // (always-on) or NPC (only when damaged — full-HP NPCs hide
      // the bar to keep pre-combat setup uncluttered, per v2.244 spec).
      // Bar sits below the token at a constant offset; width scales
      // with token radius so Tiny vs Gargantuan both look proportional.
      // Color shifts from green (full) → yellow (50%) → red (25%) for
      // at-a-glance status.
      // v2.244 — fall through to NPC HP map when token isn't linked to
      // a PC. PCs and NPCs are mutually exclusive on a token so the
      // priority is just for the (rare) case of a token with both ids.
      const pcHpInfo = token.characterId && characterHpMap
        ? characterHpMap.get(token.characterId)
        : null;
      // v2.393.0 — Per-token combatants state takes precedence over
      // the legacy creature-template fallback. tokenStateMap is keyed
      // by token.id (== combatants.id thanks to the v2.389 sync
      // trigger), so each goblin instance gets its own HP / dead /
      // conditions independent of its template. Combat damage written
      // to combatants.current_hp now appears here in real time. Falls
      // through to npcHpMap (template) for tokens that don't yet have
      // a combatant — e.g., a token created during a brief window
      // before the trigger fires, or a custom orphan token where the
      // template lookup is meaningless anyway.
      const tokenState = !pcHpInfo && tokenStateMap
        ? tokenStateMap.get(token.id)
        : null;
      const tokenStateHpInfo = (tokenState && tokenState.max_hp != null && tokenState.current_hp != null)
        ? { current: tokenState.current_hp, max: tokenState.max_hp }
        : null;
      const npcHpInfo = !pcHpInfo && !tokenStateHpInfo && token.npcId && npcHpMap
        ? npcHpMap.get(token.npcId)
        : null;
      const hpInfo = pcHpInfo ?? tokenStateHpInfo ?? npcHpInfo ?? null;
      // v2.396.0 — Player privacy gate. Players see HP bars only on
      // their own PC; everyone else's HP (party, NPCs, creatures) is
      // hidden. Prevents meta-gaming off bar fill levels — a player
      // shouldn't be able to look at the dragon and say "ok 75% so
      // probably ~400hp left". DM ignores this and sees all bars.
      // The own-PC gate is character-id match: token.characterId
      // === myCharacterId.
      const isOwnPcToken = !!myCharacterId && token.characterId === myCharacterId;
      const visibleToViewer = isDM || isOwnPcToken;
      // v2.400.0 — DM always sees HP bars on every token (PCs +
      // creatures, full or damaged). Pre-v2.400 the rule was
      // "NPC bars hide at full HP" (a v2.244 anti-clutter
      // heuristic) — but that meant after a fresh combat start
      // the DM saw NO bars on any creature until someone took
      // damage, which made tactical planning harder. The privacy
      // gate (visibleToViewer) is still enforced — players still
      // see only their own PC's bar.
      //
      // For PLAYER viewers, we keep the original "hide at full HP"
      // for any NPC bar that does slip through (shouldn't, given
      // visibleToViewer, but defense in depth).
      const showHpBar = !!hpInfo && hpInfo.max > 0 && visibleToViewer && (
        isDM
          ? true  // DM sees every bar, every time
          : (!!pcHpInfo || ((tokenStateHpInfo ?? npcHpInfo) != null && hpInfo.current < hpInfo.max))
      );
      if (showHpBar && hpInfo) {
        let bar = currentEntry.hpBar;
        if (!bar || bar.destroyed) {
          bar = new Graphics();
          container.addChild(bar);
          currentEntry.hpBar = bar;
        }
        // Width is 80% of token diameter, capped so it stays readable
        // on small tokens without floating off larger ones.
        const barWidth = Math.max(28, Math.min(r * 1.6, 96));
        const barHeight = 5;
        const barY = r + 6; // 6px below token rim
        const barX = -barWidth / 2;
        const ratio = Math.max(0, Math.min(1, hpInfo.current / hpInfo.max));

        // Color thresholds — match conventional VTT semantics.
        let fillColor: number;
        if (ratio > 0.5) fillColor = 0x34d399;       // green
        else if (ratio > 0.25) fillColor = 0xfbbf24; // yellow
        else if (ratio > 0) fillColor = 0xf87171;    // red
        else fillColor = 0x6b7280;                   // gray (0 HP / dropped)

        bar.clear();
        // Background pill (dim, full width).
        bar.setFillStyle({ color: 0x0f1012, alpha: 0.85 });
        bar.roundRect(barX, barY, barWidth, barHeight, barHeight / 2);
        bar.fill();
        // Filled portion.
        if (ratio > 0) {
          bar.setFillStyle({ color: fillColor, alpha: 0.95 });
          bar.roundRect(barX, barY, barWidth * ratio, barHeight, barHeight / 2);
          bar.fill();
        }
        // Outline for definition against busy backgrounds.
        bar.setStrokeStyle({ color: 0x000000, width: 1, alpha: 0.5 });
        bar.roundRect(barX, barY, barWidth, barHeight, barHeight / 2);
        bar.stroke();
      } else if (currentEntry.hpBar) {
        // Token is no longer linked / character data unavailable / NPC at
        // full HP — remove the bar.
        if (!currentEntry.hpBar.destroyed) {
          container.removeChild(currentEntry.hpBar);
          currentEntry.hpBar.destroy();
        }
        currentEntry.hpBar = null;
      }

      // v2.226 — name label below the token. Always shown when the
      // token has a non-empty name. Position adjusts based on whether
      // an HP bar is present (sits below it). Created lazily and
      // updated on name change. Bold white with dark stroke for
      // legibility over any background.
      const showLabel = !!token.name && token.name.trim().length > 0;
      if (showLabel) {
        let label = currentEntry.nameLabel;
        if (!label || label.destroyed) {
          label = new Text({
            text: token.name,
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '700',
              fontSize: 12,
              fill: 0xffffff,
              align: 'center',
              stroke: { color: 0x0a0c10, width: 4 },
            }),
          });
          label.anchor.set(0.5, 0);
          container.addChild(label);
          currentEntry.nameLabel = label;
        }
        if (label.text !== token.name) label.text = token.name;
        // Position below HP bar (if visible) or token rim. v2.244 —
        // showHpBar drives this rather than raw hpInfo so NPC names
        // sit closer to the token when the bar is hidden.
        const hpBarOffset = showHpBar ? 14 : 0;
        label.position.set(0, r + 6 + hpBarOffset);
      } else if (currentEntry.nameLabel) {
        if (!currentEntry.nameLabel.destroyed) {
          container.removeChild(currentEntry.nameLabel);
          currentEntry.nameLabel.destroy();
        }
        currentEntry.nameLabel = null;
      }

      // v2.244 — Dead overlay. Triggered by current_hp <= 0 on the
      // linked PC or NPC. We desaturate the entire container with a
      // ColorMatrixFilter (washes out sprite + initials + HP bar
      // uniformly — keeps a single visual signal of "dropped") and
      // overlay a red ✖ centered on the token. Filter is attached at
      // the container level so it composes with everything; the ✖ is a
      // separate Graphics stacked above the sprite. We rebuild the ✖
      // every reconcile (cheap — two strokes) so radius changes from
      // resize stay accurate.
      const isDead = !!hpInfo && hpInfo.current <= 0 && hpInfo.max > 0;
      if (isDead) {
        if (!currentEntry.deadFilter) {
          const f = new ColorMatrixFilter();
          f.desaturate();
          currentEntry.deadFilter = f;
        }
        // Pixi 8: filters is an array on Container.
        const existingFilters = (container.filters as any[]) ?? [];
        if (!existingFilters.includes(currentEntry.deadFilter)) {
          container.filters = [...existingFilters, currentEntry.deadFilter];
        }
        let xMark = currentEntry.deadX;
        if (!xMark || xMark.destroyed) {
          xMark = new Graphics();
          container.addChild(xMark);
          currentEntry.deadX = xMark;
        }
        // v2.391.0 — Heavier X. User feedback: "thick red X through the
        // characters portrait." Previous width=4 read as a thin scribble
        // on larger tokens. Width=8 with full opacity is unmistakable
        // even on Huge/Gargantuan radii. Reach extended to 0.7×r so the
        // X spans more of the token area — was 0.6 which left a lot of
        // visible token corners.
        const xR = r * 0.7;
        xMark.clear();
        xMark.setStrokeStyle({ color: 0xef4444, width: 8, alpha: 1, cap: 'round' });
        xMark.moveTo(-xR, -xR);
        xMark.lineTo(xR, xR);
        xMark.moveTo(xR, -xR);
        xMark.lineTo(-xR, xR);
        xMark.stroke();

        // v2.391.0 — Strikethrough on the name label, sized to label
        // width. Only drawn when there's actually a label visible
        // (not all tokens have names). Red, mid-thickness — readable
        // through it ("struck through enough to where you can still
        // read the name but understand that it is dead").
        if (currentEntry.nameLabel && !currentEntry.nameLabel.destroyed) {
          let strike = currentEntry.nameStrike;
          if (!strike || strike.destroyed) {
            strike = new Graphics();
            container.addChild(strike);
            currentEntry.nameStrike = strike;
          }
          const lbl = currentEntry.nameLabel;
          const labelW = lbl.width;
          const labelH = lbl.height;
          const labelCenterY = lbl.position.y + labelH / 2;
          // Slight horizontal padding so the line extends beyond the
          // text edges — looks deliberate rather than clipped.
          const halfW = labelW / 2 + 3;
          strike.clear();
          strike.setStrokeStyle({ color: 0xef4444, width: 2.5, alpha: 0.95, cap: 'round' });
          strike.moveTo(-halfW, labelCenterY);
          strike.lineTo(halfW, labelCenterY);
          strike.stroke();
        } else if (currentEntry.nameStrike) {
          // Token has no label but had a strike from a previous frame.
          if (!currentEntry.nameStrike.destroyed) {
            container.removeChild(currentEntry.nameStrike);
            currentEntry.nameStrike.destroy();
          }
          currentEntry.nameStrike = null;
        }
      } else {
        if (currentEntry.deadFilter && container.filters) {
          const filtered = (container.filters as any[]).filter(f => f !== currentEntry.deadFilter);
          container.filters = filtered.length ? filtered : null;
        }
        if (currentEntry.deadX) {
          if (!currentEntry.deadX.destroyed) {
            container.removeChild(currentEntry.deadX);
            currentEntry.deadX.destroy();
          }
          currentEntry.deadX = null;
        }
        // v2.391.0 — Tear down the strikethrough when the token comes
        // back to life (heal back above 0 HP, etc.).
        if (currentEntry.nameStrike) {
          if (!currentEntry.nameStrike.destroyed) {
            container.removeChild(currentEntry.nameStrike);
            currentEntry.nameStrike.destroy();
          }
          currentEntry.nameStrike = null;
        }
      }

      // v2.244 — Conditions strip. One small colored circle + glyph per
      // active condition that has an icon mapping. Sits below the name
      // label so it doesn't fight the HP bar for vertical space. We
      // tear down + rebuild on every conditions change rather than
      // diff child-by-child — conditions change rarely and the cost is
      // a handful of cheap Graphics. Conditions without a COND_ICON
      // entry are skipped silently (still surface as chips in the
      // quick panel).
      const conds = tokenConditionsMap?.get(token.id) ?? [];
      const iconConds = conds.filter(c => c in COND_ICON);
      const stripKey = iconConds.join('|');
      const prevStripKey = (currentEntry.conditionsLayer as any)?.__stripKey as string | undefined;
      if (iconConds.length === 0) {
        if (currentEntry.conditionsLayer) {
          if (!currentEntry.conditionsLayer.destroyed) {
            container.removeChild(currentEntry.conditionsLayer);
            currentEntry.conditionsLayer.destroy({ children: true });
          }
          currentEntry.conditionsLayer = null;
        }
      } else if (stripKey !== prevStripKey || !currentEntry.conditionsLayer) {
        // Rebuild from scratch.
        if (currentEntry.conditionsLayer) {
          if (!currentEntry.conditionsLayer.destroyed) {
            container.removeChild(currentEntry.conditionsLayer);
            currentEntry.conditionsLayer.destroy({ children: true });
          }
          currentEntry.conditionsLayer = null;
        }
        const layer = new Container();
        const ICON_SIZE = 12;            // diameter of each colored circle
        const ICON_GAP = 2;
        const totalWidth = iconConds.length * ICON_SIZE + (iconConds.length - 1) * ICON_GAP;
        // Position: under the name label (which sits at r + 6 + hpBarOffset).
        // Add a fixed 14px for the label line height.
        const stripY = r + 6 + (showHpBar ? 14 : 0) + 14;
        let cursorX = -totalWidth / 2 + ICON_SIZE / 2;
        for (const cond of iconConds) {
          const color = COND_COLOR_HEX[cond] ?? 0x94a3b8;
          const dot = new Graphics();
          dot.setFillStyle({ color, alpha: 0.95 });
          dot.circle(0, 0, ICON_SIZE / 2);
          dot.fill();
          dot.setStrokeStyle({ color: 0x0a0c10, width: 1, alpha: 0.85 });
          dot.circle(0, 0, ICON_SIZE / 2);
          dot.stroke();
          dot.position.set(cursorX, stripY);
          layer.addChild(dot);
          const glyph = new Text({
            text: COND_ICON[cond],
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '800',
              fontSize: 9,
              fill: 0x0a0c10,
              align: 'center',
            }),
          });
          glyph.anchor.set(0.5, 0.5);
          glyph.position.set(cursorX, stripY);
          layer.addChild(glyph);
          cursorX += ICON_SIZE + ICON_GAP;
        }
        (layer as any).__stripKey = stripKey;
        container.addChild(layer);
        currentEntry.conditionsLayer = layer;
      }

      // v2.339.0 — BG3 turn UX overlay (active-turn ring + movement badge).
      //
      // Mounted last in the per-token reconcile so the ring + badge sit
      // above the HP bar, name label, and conditions strip in z-order.
      // Both pieces toggle visibility based on whether THIS token is the
      // active actor's token — created lazily on first activation, kept
      // around so subsequent activations are just a .visible flip.
      //
      // The ring is sized as a full-width outline at the token radius +
      // 4px breathing room. Stroke alpha pulses between 0.6 and 1.0 via
      // the same rAF that drives lockRing — see "rAF" loop below.
      // We tint the ring color based on remaining movement: gold if any
      // movement left, red-orange if budget is fully spent. (Future v2.340
      // will add green-yellow-red drag-preview path coloring, but the
      // ring itself is a coarser at-a-glance signal.)
      //
      // The badge is a Text node with a small backing pill so it stays
      // legible over any map texture. Positions ABOVE the token (negative
      // Y from container origin) — far enough up that the HP bar and
      // name label below stay uncluttered. Hidden when not the active
      // turn, redrawn on movement-spent change.
      const isActiveTurn = !!activeTokenInfo && activeTokenInfo.tokenId === token.id;

      // ── Turn ring ──────────────────────────────────────────────────
      if (isActiveTurn) {
        if (!currentEntry.turnRing) {
          const ring = new Graphics();
          // Add as the FIRST child of the container (under the circle/
          // sprite/initials) so the ring reads as a halo, not an
          // overlay. addChildAt(0) keeps z-order natural.
          container.addChildAt(ring, 0);
          currentEntry.turnRing = ring;
        }
        const ring = currentEntry.turnRing;
        const remaining = Math.max(0, (activeTokenInfo!.max - activeTokenInfo!.used));
        // Ring color encodes remaining-budget state at a glance:
        //   • gold  (#d4a017): budget remaining
        //   • amber (#f59e0b): half or less remaining
        //   • red   (#ef4444): fully spent / can't move
        const ringColor =
          remaining <= 0                         ? 0xef4444 :
          remaining <= activeTokenInfo!.max / 2  ? 0xf59e0b :
                                                   0xd4a017;
        ring.clear();
        ring.setStrokeStyle({ color: ringColor, width: 3, alpha: 1.0 });
        ring.circle(0, 0, r + 4);
        ring.stroke();
        ring.visible = true;
        // v2.411.0 — Outer halo ring at r + 8 with low alpha. Drawn
        // as a single Graphics under the turnRing so it sits below in
        // z-order (halo → turnRing → token body → sprite). Same color
        // as the inner ring; the rAF loop animates rotation and
        // alpha. We also lay down four short arc segments to give
        // the rotation something visible to track — a solid circle
        // would be invisibly rotating.
        if (!currentEntry.turnHaloRing) {
          const halo = new Graphics();
          // Insert below turnRing — turnRing was added at index 0,
          // so addChildAt(0) again pushes turnRing to index 1.
          container.addChildAt(halo, 0);
          currentEntry.turnHaloRing = halo;
        }
        const halo = currentEntry.turnHaloRing;
        halo.clear();
        // Outer base ring at low alpha — the always-on glow.
        halo.setStrokeStyle({ color: ringColor, width: 6, alpha: 1.0 });
        halo.circle(0, 0, r + 8);
        halo.stroke();
        // Four bright arc segments distributed around the ring so
        // the rotation reads as motion. Each arc spans ~30°. The
        // overall halo alpha is animated by the rAF loop, so we
        // just set the arc strokeStyle to opaque here.
        halo.setStrokeStyle({ color: ringColor, width: 4, alpha: 1.0 });
        for (let i = 0; i < 4; i++) {
          const a0 = (i * Math.PI) / 2;
          const a1 = a0 + Math.PI / 6;
          halo.arc(0, 0, r + 8, a0, a1);
          halo.stroke();
        }
        halo.visible = true;
      } else {
        if (currentEntry.turnRing) currentEntry.turnRing.visible = false;
        if (currentEntry.turnHaloRing) currentEntry.turnHaloRing.visible = false;
      }

      // ── Selection ring (v2.358.0) ──────────────────────────────────
      // Drawn when this token is the user's currently-selected token
      // (left-click select). Cyan, thin, outside the active-turn ring
      // so both can read simultaneously without visual collision.
      const isSelected = selectedTokenId === token.id;
      if (isSelected) {
        if (!currentEntry.selectionRing) {
          const ring = new Graphics();
          // First child so it sits below the circle (reads as a halo).
          // Using addChildAt(0) places it under the token sprite/circle.
          container.addChildAt(ring, 0);
          currentEntry.selectionRing = ring;
        }
        const ring = currentEntry.selectionRing;
        ring.clear();
        ring.setStrokeStyle({ color: 0x67e8f9, width: 1.5, alpha: 0.9 });
        ring.circle(0, 0, r + 9);
        ring.stroke();
        ring.visible = true;
      } else if (currentEntry.selectionRing) {
        currentEntry.selectionRing.visible = false;
      }

      // ── Movement badge ─────────────────────────────────────────────
      if (isActiveTurn) {
        const badgeY = -(r + 18); // sits just above the token
        const remaining = Math.max(0, (activeTokenInfo!.max - activeTokenInfo!.used));
        const badgeText =
          activeTokenInfo!.max === 0
            ? '0 / 0 ft'
            : `${remaining} / ${activeTokenInfo!.max} ft${activeTokenInfo!.dashed ? ' · Dash' : ''}`;
        const badgeColor =
          remaining <= 0                         ? 0xef4444 :
          remaining <= activeTokenInfo!.max / 2  ? 0xf59e0b :
                                                   0xfde68a;

        if (!currentEntry.movementBadgeBg) {
          const bg = new Graphics();
          container.addChild(bg);
          currentEntry.movementBadgeBg = bg;
        }
        if (!currentEntry.movementBadge) {
          const txt = new Text({
            text: badgeText,
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '800',
              fontSize: 11,
              fill: badgeColor,
              align: 'center',
            }),
          });
          txt.anchor.set(0.5, 0.5);
          container.addChild(txt);
          currentEntry.movementBadge = txt;
        }
        const txt = currentEntry.movementBadge;
        const bg = currentEntry.movementBadgeBg;
        // Update text + color (cheap; .text setter triggers a re-layout
        // only if the string changed). Re-applying TextStyle would
        // allocate a new style object — tweak fill in place instead.
        if (txt.text !== badgeText) txt.text = badgeText;
        (txt.style as TextStyle).fill = badgeColor;
        txt.position.set(0, badgeY);
        // Backing pill sized to the measured text width with padding.
        const padX = 6;
        const padY = 3;
        const w = txt.width + padX * 2;
        const h = txt.height + padY * 2;
        bg.clear();
        bg.setFillStyle({ color: 0x0a0c10, alpha: 0.85 });
        bg.roundRect(-w / 2, badgeY - h / 2, w, h, 4);
        bg.fill();
        bg.setStrokeStyle({ color: badgeColor, width: 1, alpha: 0.5 });
        bg.roundRect(-w / 2, badgeY - h / 2, w, h, 4);
        bg.stroke();
        txt.visible = true;
        bg.visible = true;
      } else {
        if (currentEntry.movementBadge) currentEntry.movementBadge.visible = false;
        if (currentEntry.movementBadgeBg) currentEntry.movementBadgeBg.visible = false;
      }

      // ── v2.341.0 — Action / Bonus / Reaction pips ─────────────────
      // Three small dots in a row, sitting just under the movement
      // badge, marking which parts of the action economy the active
      // actor still has available this turn. A=Action, B=Bonus,
      // R=Reaction. Available pips render gold; consumed pips dim
      // to a charcoal fill with reduced alpha so the read at a
      // glance is "shiny = ready, dull = spent."
      //
      // We lazy-create the layer + 3 child Graphics+Text pairs on
      // first activation and only mutate fills/alpha thereafter.
      // That avoids tearing down + rebuilding on every state flip
      // (action flips every couple seconds during play).
      // v2.411.0 — Action / Bonus / Reaction pips above tokens removed
      // per UX feedback (the strip duplicates info already visible on
      // the InitiativeStrip + MonsterActionPanel and was visually
      // noisy directly above the token). Keep the layer ref so a
      // legacy entry (e.g. from a hot-reload) gets cleanly hidden,
      // and skip create+update entirely. If we want them back later,
      // restore the v2.341 block from git history.
      if (currentEntry.economyPipsLayer) currentEntry.economyPipsLayer.visible = false;

      // ── Unlocked glyph (v2.412.0) ──────────────────────────────────
      // Open-padlock above any UNLOCKED token, visible ONLY to the
      // DM. Players never see lock state — lock is a DM-side workflow
      // affordance. Locked tokens (the new default) get NO indicator
      // so the map stays uncluttered. The glyph signals "this token
      // can be moved freely outside its turn" — a deliberately
      // conspicuous DM warning since unlocked tokens bypass the
      // active-turn movement gate.
      //
      // Lazy-create on first need, toggle .visible thereafter. Position
      // mirrors movement badge offset (-(r + 18)); offset right when
      // also the active turn so the badge stays unobstructed.
      const tokenIsUnlocked = !((token as any).isLocked);
      const showUnlockedGlyph = isDM && tokenIsUnlocked;
      if (showUnlockedGlyph) {
        if (!currentEntry.lockGlyph) {
          const glyph = new Text({
            text: '🔓',
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontSize: 16,
              fill: 0xffffff,
              align: 'center',
            }),
          });
          glyph.anchor.set(0.5, 0.5);
          container.addChild(glyph);
          currentEntry.lockGlyph = glyph;
        }
        const glyph = currentEntry.lockGlyph;
        const offsetX = isActiveTurn ? 18 : 0;
        glyph.position.set(offsetX, -(r + 18));
        glyph.visible = true;
      } else if (currentEntry.lockGlyph) {
        currentEntry.lockGlyph.visible = false;
      }
    }
  }, [tokens, viewport, setDragging, onContextMenu, gridSizePx, remoteDragLocks, currentUserId, characterHpMap, npcHpMap, tokenStateMap, tokenConditionsMap, isDM, myCharacterId, activeTokenInfo, selectedTokenId]);

  useEffect(() => {
    if (!viewport || !canvasEl) return;

    // v2.216 — throttle drag_move broadcasts to ~20Hz (50ms) so a
    // 60fps pointermove doesn't flood the Realtime channel. Leading-
    // edge: send immediately on the first movement after the window
    // elapses. The final position is covered by onPointerUp below.
    let lastBroadcastMs = 0;

    // v2.340.0 — Live drag-preview path (BG3-style).
    //
    // A single persistent Graphics overlay attached to the viewport,
    // re-drawn on every pointermove during a drag. Shows:
    //   • Origin → snapped-cursor straight line (faint dashed)
    //   • Destination cell highlight (rounded square marker)
    //   • Distance + cost-vs-remaining label near the cursor
    //
    // The line color encodes whether the move is affordable:
    //   • green   — within remaining movement
    //   • amber   — into Dash range / dipping past base speed
    //   • red     — over the cap (drop will snap back if active turn)
    //
    // The overlay is purely visual (eventMode='none' so it never
    // captures clicks meant for tokens/walls underneath). It only
    // renders during an actual drag — on pointerup we clear() so
    // nothing is left behind. When combat isn't running we still
    // show the path (for distance reference) but skip color-grading
    // since there's no budget to compare against — a soft white line.
    const previewGfx = new Graphics();
    previewGfx.eventMode = 'none';
    previewGfx.visible = false;
    viewport.addChild(previewGfx);
    const previewLabel = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontWeight: '800',
        fontSize: 13,
        fill: 0xfde68a,
        stroke: { color: 0x0a0c10, width: 3 },
        align: 'center',
      }),
    });
    previewLabel.anchor.set(0.5, 1);
    previewLabel.eventMode = 'none';
    previewLabel.visible = false;
    viewport.addChild(previewLabel);

    function clearPreview() {
      previewGfx.clear();
      previewGfx.visible = false;
      previewLabel.visible = false;
    }

    function drawPreview(originX: number, originY: number, cursorX: number, cursorY: number) {
      // Snap the cursor to the nearest grid cell center so the preview
      // matches what will actually commit (snapToCellCenter is what
      // pointerup uses too — keep them in sync).
      const snapped = snapToCellCenter(cursorX, cursorY, gridSizePx);
      const tx = Math.max(0, Math.min(worldWidth, snapped.x));
      const ty = Math.max(0, Math.min(worldHeight, snapped.y));

      // Compute Chebyshev distance in feet using the canonical math
      // from lib/movement.ts. Convert from world pixels → cells via
      // gridSizePx, then feed the cell coordinates to the helper.
      // v2.357.0 — Math.floor (not Math.round). Tokens are stored at
      // center-of-cell positions (col*size + size/2), so x/size is
      // N+0.5 for column N. Math.round on N+0.5 returns N+1 (off-by-
      // one toward the bottom-right cell). Math.floor returns N
      // correctly. Pre-fix the distance result was still right because
      // both endpoints had the same offset and they canceled, but any
      // caller reading the cell coords directly was landing one cell
      // SE of the actual token.
      const fromCell = { row: Math.floor(originY / gridSizePx), col: Math.floor(originX / gridSizePx) };
      const toCell = { row: Math.floor(ty / gridSizePx), col: Math.floor(tx / gridSizePx) };
      const distanceFt = computeChebyshevFt(fromCell.row, fromCell.col, toCell.row, toCell.col);

      // Color decision. If we have an active actor + this dragged token
      // is theirs, grade green/amber/red against the budget. Otherwise
      // (DM repositioning monsters out of combat, or non-active token),
      // show a neutral white line so the distance label still helps.
      const ati = activeTokenInfoRef.current;
      const drag = dragRef.current;
      const inCombatForThisToken = !!(ati && drag && ati.tokenId === drag.id && ati.max > 0);
      let lineColor = 0xffffff;
      let labelColor = 0xffffff;
      let costLabel = `${distanceFt} ft`;
      if (inCombatForThisToken) {
        const remaining = Math.max(0, ati!.max - ati!.used);
        const wouldUse = ati!.used + distanceFt;
        if (wouldUse > ati!.max) {
          lineColor = 0xef4444; labelColor = 0xfca5a5;          // red — overspend
        } else if (wouldUse > ati!.max - Math.floor(ati!.max / 4)) {
          lineColor = 0xf59e0b; labelColor = 0xfde68a;          // amber — getting close
        } else {
          lineColor = 0x22c55e; labelColor = 0x86efac;          // green — comfortably within budget
        }
        costLabel = `${distanceFt} ft  ·  ${remaining - distanceFt >= 0 ? remaining - distanceFt : 0} left`;
      }

      // Draw: dashed line from origin → snapped cursor + small square
      // marker at the destination. PIXI v8 has no native dashed-line
      // helper, so we manually segment the line with `moveTo / lineTo`
      // jumps. ~6px on / 6px off reads as obviously-temporary.
      previewGfx.clear();
      const dx = tx - originX;
      const dy = ty - originY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        const nx = dx / len;
        const ny = dy / len;
        const dashOn = 8;
        const dashOff = 6;
        previewGfx.setStrokeStyle({ color: lineColor, width: 3, alpha: 0.85 });
        let traveled = 0;
        while (traveled < len) {
          const segStart = traveled;
          const segEnd = Math.min(traveled + dashOn, len);
          previewGfx.moveTo(originX + nx * segStart, originY + ny * segStart);
          previewGfx.lineTo(originX + nx * segEnd, originY + ny * segEnd);
          traveled += dashOn + dashOff;
        }
        previewGfx.stroke();
      }

      // v2.398.0 — Destination footprint marker. Pre-v2.398 this
      // was hardcoded `gridSizePx * 0.85` — a single-cell preview
      // square regardless of token size. So when dragging an Ancient
      // Red Dragon (3×3 footprint), the user saw the full dragon
      // ghost at the cursor but a tiny single-cell preview square
      // at the snap target — two visuals that disagreed on the
      // dragon's size. Now we look up the dragged token's footprint
      // and draw a marker the size of its actual occupancy.
      //
      // The store lookup is cheap (it's a Zustand selector hit on
      // an object map) and the size only changes via context-menu
      // resize, so the value is stable for the duration of any
      // single drag. We still subtract a few px from the marker so
      // it fits visually inside the footprint cells rather than
      // pixel-aligned to the grid lines.
      const draggedToken = drag ? useBattleMapStore.getState().tokens[drag.id] : null;
      const dragFootCells = draggedToken
        ? tokenFootprintCells(draggedToken.size)
        : 1;
      const mark = (dragFootCells * gridSizePx) - 4;
      previewGfx.setStrokeStyle({ color: lineColor, width: 2, alpha: 0.9 });
      previewGfx.roundRect(tx - mark / 2, ty - mark / 2, mark, mark, 4);
      previewGfx.stroke();

      previewGfx.visible = true;

      // Label sits just above the destination cell. Keeping it in
      // world space (not screen space) means it rides the viewport
      // zoom — readable at 1x, hugs the cell at 4x. Acceptable.
      previewLabel.text = costLabel;
      (previewLabel.style as TextStyle).fill = labelColor;
      previewLabel.position.set(tx, ty - mark / 2 - 4);
      previewLabel.visible = true;
    }

    function onPointerMove(e: PointerEvent) {
      // v2.226 — click probe: if pointer moves > CLICK_THRESHOLD_PX
      // in screen space, mark drag as "moved" (suppresses click).
      const probe = clickProbeRef.current;
      if (probe && !probe.didMove) {
        const dx = e.clientX - probe.downClientX;
        const dy = e.clientY - probe.downClientY;
        if (dx * dx + dy * dy > 25) { // > 5px move
          probe.didMove = true;
        }
      }

      const drag = dragRef.current;
      if (!drag || !viewport || !canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = viewport.toWorld(screenX, screenY);
      const newX = worldPoint.x - drag.offsetX;
      const newY = worldPoint.y - drag.offsetY;
      updatePos(drag.id, newX, newY);

      // v2.340.0 — live drag preview. Only show after the user has
      // actually moved (probe.didMove guards against firing on a
      // pure-click landing on the token).
      if (probe?.didMove) {
        drawPreview(drag.originX, drag.originY, newX, newY);
      }

      // Throttled broadcast to peers.
      const now = performance.now();
      if (now - lastBroadcastMs >= 50) {
        onDragMove?.(drag.id, newX, newY);
        lastBroadcastMs = now;
      }
    }

    function onPointerUp(e: PointerEvent) {
      const drag = dragRef.current;
      const probe = clickProbeRef.current;
      // v2.226 — click classifier. If pointer moved < threshold AND
      // the down→up window was short, treat as a click and fire the
      // callback. Drag commit runs in EITHER case so the position
      // (snapped to nearest cell) ends up consistent on the DB.
      const wasClick = !!(
        probe &&
        !probe.didMove &&
        performance.now() - probe.downAtMs < 250
      );

      if (!drag) {
        clickProbeRef.current = null;
        return;
      }
      const t = useBattleMapStore.getState().tokens[drag.id];
      if (t) {
        // v2.400.0 — Compute final position from the pointerup event
        // coordinates, not the last pointermove's stored t.x/y. Pre-
        // v2.400 we snapped t.x/y, which lagged the cursor by however
        // far it moved between the last 60Hz pointermove and the
        // pointerup. For a cursor moving even modestly at release,
        // that gap could be 5-10px — enough to push across a cell
        // boundary and snap to the wrong cell. Reading clientX/Y
        // from `e` (the pointerup event itself) gives the exact
        // release position.
        let finalX = t.x;
        let finalY = t.y;
        if (viewport && canvasEl && e.clientX !== undefined) {
          const rect = canvasEl.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const worldPoint = viewport.toWorld(screenX, screenY);
          finalX = worldPoint.x - drag.offsetX;
          finalY = worldPoint.y - drag.offsetY;
        }
        // v2.401.0 — Size-aware snap. Even-size tokens (Large 2×2,
        // Garg 4×4) anchor on grid intersections; odd-size tokens
        // anchor on cell centers. snapTokenAnchor picks the right
        // snap target. Pre-v2.401 always snapped to cell center,
        // which made dropping a Large dragon "shift to a different
        // spot" because the visual's natural center is a grid
        // intersection but snap put the anchor at a cell center,
        // re-centering the visual asymmetrically.
        const snapped = snapTokenAnchor(finalX, finalY, t.size, gridSizePx);
        const clampedX = Math.max(0, Math.min(worldWidth, snapped.x));
        const clampedY = Math.max(0, Math.min(worldHeight, snapped.y));
        // v2.268.0 — wall-blocked movement check. If the segment from
        // the drag origin to the (clamped, snapped) drop point crosses
        // any wall with blocksMovement=true (and not an open door), the
        // drop is rejected and the token snaps back to its origin.
        // Click drops (wasClick === true) skip this check — clicks
        // don't change position, so there's no segment to validate.
        // The check is also skipped when the user didn't actually move
        // (origin === drop) since that's a no-op drop.
        const movedAtAll = drag.originX !== clampedX || drag.originY !== clampedY;
        const blocked = !wasClick && movedAtAll && segmentBlockedByWall(
          drag.originX, drag.originY,
          clampedX, clampedY,
          Object.values(useBattleMapStore.getState().walls),
        );
        if (blocked) {
          // Snap back to origin. updatePos rewrites the local store;
          // peers see this position on the next broadcast/commit cycle.
          // No DB write — the token's row in scene_tokens already has
          // the origin position (we never committed the drag-target
          // for this drop, since updatePos calls below this branch).
          updatePos(drag.id, drag.originX, drag.originY);
          onDragMove?.(drag.id, drag.originX, drag.originY);
          onMovementBlocked?.();
        } else {
          // v2.340.0 — movement-budget enforcement (BG3-style hard
          // block). When combat is active AND the dragged token is
          // the active actor's, validate that the drop distance
          // doesn't exceed remaining movement (Dash-doubled, condition-
          // zeroed per RAW). If it does, snap the token back to
          // origin and fire the budget-exceeded callback. On success,
          // commit BOTH the position write AND a logMovement call so
          // movement_used_ft updates and the badge reflects the new
          // remaining budget.
          //
          // canMove is async (single SELECT), so we sequence:
          //   1. validate (canMove)
          //   2a. if !allowed → snap back, fire callback, return
          //   2b. if allowed → commit pos via tokensApi (existing
          //       wall-trigger path), then logMovement
          //
          // Out-of-combat drags (no active actor, or this token
          // isn't the active one) skip enforcement entirely — DM
          // pre-staging, NPC re-positioning by DM, all unchanged.
          const ati = activeTokenInfoRef.current;
          // v2.403.0 — Tightened enforcement check. Pre-v2.403 this
          // gated on `ati.tokenId === drag.id`. activeTokenInfo.tokenId
          // is computed by walking liveTokens for one whose npcId or
          // characterId matches currentActor.entity_id. For
          // multi-instance creatures (multiple goblins sharing one
          // homebrew_monsters row → same creature_id on each token)
          // the walk picks ONE token — which may not be the one the
          // user is dragging. That dropped enforcement on most
          // dragged copies. Now we re-check by reading the dragged
          // token's identifiers directly from the store and matching
          // them against currentActor.entity_id.
          let enforceMove = false;
          let activeMatch = false;
          if (!wasClick && movedAtAll && ati && ati.participantId) {
            // Original check — fast path when activeTokenInfo correctly
            // identified the dragged token.
            if (ati.tokenId === drag.id) {
              activeMatch = true;
            } else {
              // Fallback: check the dragged token's identifiers.
              const draggedTok = useBattleMapStore.getState().tokens[drag.id];
              if (draggedTok) {
                const activeEntity = ati.participantEntityId ?? '';
                if (ati.participantType === 'character'
                    && draggedTok.characterId
                    && draggedTok.characterId === activeEntity) {
                  activeMatch = true;
                } else if (ati.participantType !== 'character'
                    && draggedTok.npcId
                    && draggedTok.npcId === activeEntity) {
                  activeMatch = true;
                }
              }
            }
            enforceMove = activeMatch;
          }
          // v2.403.0 — Diagnostic log so the DM can confirm enforcement
          // is firing on the right tokens. Remove or quiet once the
          // movement-enforcement bug class is closed.
          if (movedAtAll && !wasClick) {
            // eslint-disable-next-line no-console
            console.log('[BattleMapV2] drop commit', {
              tokenId: drag.id,
              hasAti: !!ati,
              atiTokenId: ati?.tokenId,
              atiParticipantId: ati?.participantId,
              atiEntityId: ati?.participantEntityId,
              enforceMove,
              activeMatch,
            });
          }

          // v2.357.0 — Math.floor (not Math.round). See drawPreview
          // comment for rationale. Tokens stored at center-of-cell
          // produce N+0.5 when divided by cell size; floor gives N.
          const fromCellRow = Math.floor(drag.originY / gridSizePx);
          const fromCellCol = Math.floor(drag.originX / gridSizePx);
          const toCellRow = Math.floor(clampedY / gridSizePx);
          const toCellCol = Math.floor(clampedX / gridSizePx);
          const distanceFt = computeChebyshevFt(fromCellRow, fromCellCol, toCellRow, toCellCol);

          // v2.361.0 — Snappy local over-budget snap-back. User
          // feedback: snap-back was sluggish because we awaited a
          // canMove() round-trip (~100-500ms over the network) before
          // resetting the token. The local activeTokenInfo already
          // has authoritative .max + .used values that are kept in
          // sync via the combat-state push loop; checking distanceFt
          // > remaining locally gives the same answer 99% of the
          // time. Predict locally first → snap immediately if over —
          // no network wait. canMove still runs below as the
          // authoritative server check (catches edge cases where the
          // local cache was stale due to another concurrent action),
          // but by then the user has already seen the snap.
          if (enforceMove) {
            const remaining = Math.max(0, ati!.max - ati!.used);
            if (distanceFt > remaining) {
              // Snap back instantly. Skip both the optimistic position
              // commit AND the canMove round-trip. No DB write; the
              // origin position is still canonical in scene_tokens.
              useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
              onDragMove?.(drag.id, drag.originX, drag.originY);
              onMovementBlocked?.();
              return;
            }
          }

          // Optimistic UI: position the token at the drop site
          // immediately. If validation fails, we'll snap it back
          // below — most drags succeed, so this avoids a perceptible
          // pause on the common path.
          updatePos(drag.id, clampedX, clampedY);
          onDragMove?.(drag.id, clampedX, clampedY);

          const commit = async () => {
            if (enforceMove) {
              const check = await canMove(ati!.participantId!, distanceFt);
              if (!check.allowed) {
                // Authoritative server-side rejection. The local
                // pre-check above passed, so this only fires when
                // the local cache was stale (rare). Same snap-back
                // path as the local short-circuit.
                useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
                onDragMove?.(drag.id, drag.originX, drag.originY);
                onMovementBlocked?.();
                return;
              }
            }
            if (wasClick) return; // pure click — no commit needed
            // v2.213 commit (existing path) — wall-trigger rejection
            // handling is preserved verbatim from pre-v2.340.
            const result = await tokensApi.updateTokenPos(drag.id, clampedX, clampedY);
            if (!result.ok) {
              if (result.reason === 'wall_blocked') {
                useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
                onDragMove?.(drag.id, drag.originX, drag.originY);
                onMovementBlocked?.();
              } else {
                console.error('[BattleMapV2] pos commit failed', result);
              }
              return;
            }
            // v2.340.0 — log the movement so movement_used_ft updates
            // server-side and the badge reflects the new remaining
            // budget on the next combat-state push. Also fires
            // opportunity-attack offers for adjacent enemies.
            if (enforceMove && distanceFt > 0) {
              try {
                await logMovement({
                  campaignId: ati!.campaignId!,
                  encounterId: ati!.encounterId,
                  participantId: ati!.participantId!,
                  participantName: ati!.participantName!,
                  participantType: ati!.participantType!,
                  fromRow: fromCellRow,
                  fromCol: fromCellCol,
                  toRow: toCellRow,
                  toCol: toCellCol,
                  distanceFt,
                });
              } catch (err) {
                console.error('[BattleMapV2] logMovement threw', err);
              }
            }
            // v2.358.0 — Record token-move undo (DM only).
            // User feedback: "if the character moved into a incorrect
            // position for the dm it should be in their log in the
            // bottom right corner." Capture the move before/after so
            // a single Ctrl-Z (or the floating Undo Last Move button)
            // restores the original position. Skipped for player drags
            // since the multi-user race concerns useUndoRedo flagged
            // still apply to player tokens.
            if (isDM) {
              const tokenId = drag.id;
              const fromX = drag.originX;
              const fromY = drag.originY;
              const toX = clampedX;
              const toY = clampedY;
              recordUndoableRef.current?.({
                label: 'move token',
                forward: async () => {
                  useBattleMapStore.getState().updateTokenPosition(tokenId, toX, toY);
                  await tokensApi.updateTokenPos(tokenId, toX, toY);
                },
                backward: async () => {
                  useBattleMapStore.getState().updateTokenPosition(tokenId, fromX, fromY);
                  await tokensApi.updateTokenPos(tokenId, fromX, fromY);
                },
              });
            }
          };
          commit().catch(err => console.error('[BattleMapV2] drop commit threw', err));
        }
      }
      // v2.340.0 — always clear the preview overlay on pointerup.
      // Even on click drops or rejected drops, the dashes shouldn't
      // linger after the gesture ends.
      clearPreview();
      const entry = gfxMapRef.current.get(drag.id);
      if (entry) {
        entry.container.cursor = 'grab';
        entry.container.alpha = 1;
      }
      // v2.216: release the lock — whether or not the commit succeeds,
      // we're done locally. Stale commits are rare; stale locks would
      // block the UI.
      onDragEnd?.(drag.id);
      // v2.226: fire click callback AFTER drag teardown so the parent
      // can rely on store/lock state being clean.
      if (wasClick && probe) {
        onTokenClick?.(probe.id, e.clientX, e.clientY);
      }
      dragRef.current = null;
      clickProbeRef.current = null;
      setDragging(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      // v2.340.0 — tear down the persistent drag-preview overlay so
      // it doesn't leak between viewport remounts (rare, but happens
      // on scene change). destroy() releases the Graphics + Text
      // GPU resources cleanly.
      try {
        if (previewGfx.parent) previewGfx.parent.removeChild(previewGfx);
        previewGfx.destroy();
        if (previewLabel.parent) previewLabel.parent.removeChild(previewLabel);
        previewLabel.destroy();
      } catch {
        // PIXI sometimes throws if the parent has already disposed
        // — safe to ignore on teardown.
      }
    };
  }, [viewport, canvasEl, updatePos, setDragging, worldWidth, worldHeight, gridSizePx, onDragMove, onDragEnd, onTokenClick, onMovementBlocked]);

  return null;
}

function TokenContextMenu(props: {
  state: ContextMenuState;
  // v2.282: gate Hide/Show on DM. Players who somehow trigger the
  // menu (e.g., right-clicking their own character token, since the
  // canvas right-click isn't currently isDM-gated) still see the
  // menu but get a slimmer set of actions — RLS would reject most
  // writes anyway, so showing them an action that 500s is worse
  // than not showing it.
  isDM: boolean;
  onClose: () => void;
  onRequestUpload: (tokenId: string) => void;
  // v2.222 — when set, the menu shows a "View Character Sheet" item
  // for tokens linked to a character. Caller handles the navigate.
  onOpenCharacter?: (characterId: string) => void;
  // v2.358.0 — opens the quick panel that pre-v2.358 left-click used
  // to open auto. Caller resolves which panel based on token type
  // (PC quick panel for characterId, NPC quick panel for npcId, or
  // bare context menu for unlinked). Lets users still get to the
  // panel after we made plain left-click into "just select."
  onOpenQuickPanel?: (tokenId: string) => void;
}) {
  const { state, isDM, onClose, onRequestUpload, onOpenCharacter, onOpenQuickPanel } = props;
  const token = useBattleMapStore(s => s.tokens[state.tokenId]);
  const removeToken = useBattleMapStore(s => s.removeToken);
  const updateTokenFields = useBattleMapStore(s => s.updateTokenFields);
  const [submenu, setSubmenu] = useState<'none' | 'size' | 'color'>('none');
  // v2.241 — modal handle for the rename prompt.
  const { prompt: promptModal } = useModal();

  useEffect(() => {
    function handler() {
      onClose();
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', handler);
      window.addEventListener('keydown', keyHandler);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  if (!token) return null;

  // v2.213: commit discrete edits to DB after optimistic local update.
  function applyPatch(patch: Partial<Token>) {
    updateTokenFields(state.tokenId, patch);
    tokensApi.updateToken(state.tokenId, patch).catch(err =>
      console.error('[BattleMapV2] token update commit failed', err)
    );
  }

  function applyDelete() {
    removeToken(state.tokenId);
    tokensApi.deleteToken(state.tokenId).catch(err =>
      console.error('[BattleMapV2] token delete commit failed', err)
    );
  }

  const menuWidth = 180;
  const menuHeight = 240;
  const leftRaw = state.clientX;
  const topRaw = state.clientY;
  const left = Math.min(leftRaw, (typeof window !== 'undefined' ? window.innerWidth : 1200) - menuWidth - 8);
  const top = Math.min(topRaw, (typeof window !== 'undefined' ? window.innerHeight : 800) - menuHeight - 8);

  const menuBaseStyle: React.CSSProperties = {
    position: 'fixed',
    left,
    top,
    minWidth: menuWidth,
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-md, 8px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    fontFamily: 'var(--ff-body)',
    fontSize: 12,
    color: 'var(--t-1)',
    padding: 4,
    zIndex: 9999,
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: 'var(--r-sm, 4px)',
  };

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  if (submenu === 'size') {
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Size
        </div>
        {SIZE_OPTIONS.map(sz => (
          <div
            key={sz}
            style={{
              ...itemStyle,
              background: token.size === sz ? 'rgba(167,139,250,0.12)' : undefined,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = token.size === sz ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
            onClick={() => { applyPatch({ size: sz }); onClose(); }}
          >
            <span style={{ textTransform: 'capitalize' as const }}>{sz}</span>
            {token.size === sz && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
          </div>
        ))}
      </div>,
      document.body,
    );
  }

  if (submenu === 'color') {
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Color
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 6 }}>
          {TOKEN_COLORS.map(c => (
            <div
              key={c}
              onClick={() => { applyPatch({ color: c }); onClose(); }}
              style={{
                width: 44, height: 32,
                background: `#${c.toString(16).padStart(6, '0')}`,
                borderRadius: 4,
                cursor: 'pointer',
                border: token.color === c ? '2px solid #fff' : '2px solid transparent',
                boxSizing: 'border-box' as const,
              }}
              title={`#${c.toString(16).padStart(6, '0')}`}
            />
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div style={menuBaseStyle} onMouseDown={stop}>
      <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {token.name || 'Token'}
      </div>
      {/* v2.358.0 — Open Quick Panel. Restores the pre-v2.358 left-
          click behavior as an explicit menu action. Renders for any
          token that has a quick panel — PCs and NPCs both. Cyan
          palette to distinguish from the purple "View Character
          Sheet" navigate-away action below. */}
      {onOpenQuickPanel && (token.characterId || token.npcId) && (
        <div
          style={{
            ...itemStyle,
            color: '#67e8f9',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(103,232,249,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          onClick={() => {
            onOpenQuickPanel(state.tokenId);
            onClose();
          }}
        >
          Open Quick Panel
        </div>
      )}
      {/* v2.222 — quick-jump to the linked character sheet. Only
          renders when the token is bound to a character via
          characterId AND the parent provided a navigate handler.
          Visually offset (purple, separator) so it reads as a
          navigation action vs the edit ops below. */}
      {token.characterId && onOpenCharacter && (
        <div
          style={{
            ...itemStyle,
            color: '#a78bfa',
            borderBottom: '1px solid var(--c-border)',
            marginBottom: 4,
            paddingBottom: 8,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          onClick={() => {
            onOpenCharacter(token.characterId!);
            onClose();
          }}
        >
          View Character Sheet
        </div>
      )}
      {[
        // v2.411.0: Lock/Unlock toggle. DM-only. Locked tokens refuse
        // drag for everyone (DM included) until unlocked. Visual state
        // is communicated by a padlock glyph drawn above the token.
        // Place this FIRST so it's the most prominent DM control —
        // typically a DM locks scene-furniture tokens (statues, traps,
        // map markers) once at scene setup, and want it on the top of
        // the menu rather than buried below resize/recolor.
        ...(isDM ? [{
          label: (token as any).isLocked ? '🔓 Unlock Token' : '🔒 Lock Token',
          onClick: () => {
            applyPatch({ isLocked: !(token as any).isLocked } as any);
            onClose();
          },
        }] : []),
        // v2.282: Hide/Show toggle. DM-only — RLS already gates the
        // write, but no point offering an action that will error.
        // Eye icon flips state on click; we close the menu after so
        // the DM gets immediate feedback (the token's alpha changes
        // via the optimistic store update). Skipped for tokens
        // linked to a character — the player NEEDS to see their PC,
        // and hiding it would just re-hide on every re-render
        // because it'd never appear in the player's RLS-filtered
        // SELECT anyway. Hide is meaningful for monsters/NPCs/marks.
        ...(isDM && !token.characterId ? [{
          label: token.visibleToAll ? '👁 Hide from Players' : '👁 Reveal to Players',
          onClick: () => {
            applyPatch({ visibleToAll: !token.visibleToAll });
            onClose();
          },
        }] : []),
        { label: 'Rename…', onClick: async () => {
          // v2.241 — was window.prompt.
          const next = await promptModal({
            title: 'Rename token',
            defaultValue: token.name,
            placeholder: 'Token name',
            confirmLabel: 'Save',
          });
          if (next !== null) {
            applyPatch({ name: next.trim() || token.name });
          }
          onClose();
        }},
        { label: 'Resize ▸', onClick: () => setSubmenu('size') },
        { label: 'Recolor ▸', onClick: () => setSubmenu('color') },
        // v2.215: portrait upload. Closes the menu and lets the parent
        // trigger the hidden file input for tokenId.
        { label: token.imageStoragePath ? 'Replace portrait…' : 'Upload portrait…', onClick: () => {
          onRequestUpload(state.tokenId);
          onClose();
        }},
        ...(token.imageStoragePath ? [{ label: 'Remove portrait', onClick: () => {
          applyPatch({ imageStoragePath: null });
          onClose();
        }}] : []),
      ].map(opt => (
        <div
          key={opt.label}
          style={itemStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.12)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          onClick={opt.onClick}
        >
          {opt.label}
        </div>
      ))}
      <div
        style={{ ...itemStyle, color: '#f87171', borderTop: '1px solid var(--c-border)', marginTop: 4, paddingTop: 8 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(248,113,113,0.12)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        onClick={() => {
          applyDelete();
          onClose();
        }}
      >
        Delete
      </div>
    </div>,
    document.body,
  );
}

/**
 * v2.219 — Scene settings modal.
 *
 * Lets the DM edit scene name, grid dimensions, and published state,
 * plus delete the scene. Dimensions accept arbitrary positive integers;
 * DB CHECK constraints (from v2.208 migration) enforce > 0.
 *
 * "Fit to map image" helper: when a background is uploaded, we can read
 * the natural pixel dimensions of the cached Texture (Pixi has already
 * loaded it for BackgroundLayer) via Assets.get(url). From there we
 * derive cell counts that match the image aspect at the CURRENT grid_size_px.
 *   widthCells  = round(imageWidth  / gridSizePx)
 *   heightCells = round(imageHeight / gridSizePx)
 * This assumes the DM wants one image pixel ≈ one visual pixel at 1x
 * zoom, which is the most common case. For images much larger or
 * smaller than the cell count, the DM can adjust gridSizePx first.
 *
 * Commit flow: form fields update local modal state on each change.
 * "Save" applies changes via scenesApi.updateScene + optimistic local
 * updates to both `scenes` array and `currentScene`. Realtime (v2.214)
 * echoes the changes to other clients.
 *
 * "Delete" uses an inline confirm modal as of v2.241 (replaced
 * window.confirm).
 */
function SceneSettingsModal(props: {
  scene: scenesApi.Scene;
  onClose: () => void;
  onScenePatched: (patch: Partial<scenesApi.Scene>) => void;
  onSceneDeleted: (id: string) => void;
}) {
  const { scene, onClose, onScenePatched, onSceneDeleted } = props;
  const { showToast } = useToast();
  const { confirm: confirmModal } = useModal();
  const [name, setName] = useState(scene.name);
  const [gridSizePx, setGridSizePx] = useState(scene.gridSizePx);
  const [widthCells, setWidthCells] = useState(scene.widthCells);
  const [heightCells, setHeightCells] = useState(scene.heightCells);
  const [isPublished, setIsPublished] = useState(scene.isPublished);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Re-sync local state when the scene prop changes (e.g. Realtime
  // update arrived from another client while modal was open). Happens
  // rarely but prevents "save stomps remote update" silently.
  useEffect(() => {
    setName(scene.name);
    setGridSizePx(scene.gridSizePx);
    setWidthCells(scene.widthCells);
    setHeightCells(scene.heightCells);
    setIsPublished(scene.isPublished);
  }, [scene.id, scene.updatedAt]);

  // Escape closes the modal.
  useEffect(() => {
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  // "Fit to map image" — inspects the cached texture for the scene's
  // background and sets widthCells/heightCells to match the image
  // aspect at current gridSizePx. Only offered when a background path
  // exists; the button is disabled otherwise.
  const fitToImage = useCallback(async () => {
    if (!scene.backgroundStoragePath) return;
    const url = assetsApi.getSceneBackgroundUrl(scene.backgroundStoragePath);
    if (!url) return;
    try {
      // Assets.get returns the cached texture if already loaded; .load
      // fetches it otherwise. Either way, we get dimensions.
      let texture = Assets.get<Texture>(url);
      if (!texture) {
        texture = await Assets.load<Texture>(url);
      }
      if (!texture?.width || !texture?.height) return;
      const nextW = Math.max(1, Math.round(texture.width / gridSizePx));
      const nextH = Math.max(1, Math.round(texture.height / gridSizePx));
      setWidthCells(nextW);
      setHeightCells(nextH);
    } catch (err) {
      console.error('[SceneSettings] fit-to-image failed', err);
    }
  }, [scene.backgroundStoragePath, gridSizePx]);

  async function save() {
    // Minimal validation — positive integers only. DB CHECK enforces
    // server-side but we give fast feedback here.
    if (!Number.isFinite(gridSizePx) || gridSizePx < 10 || gridSizePx > 500) {
      showToast('Grid size must be between 10 and 500 pixels.', 'warn');
      return;
    }
    if (!Number.isFinite(widthCells) || widthCells < 1 || widthCells > 200) {
      showToast('Width must be between 1 and 200 cells.', 'warn');
      return;
    }
    if (!Number.isFinite(heightCells) || heightCells < 1 || heightCells > 200) {
      showToast('Height must be between 1 and 200 cells.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const patch: Partial<scenesApi.Scene> = {
        name: name.trim() || scene.name,
        gridSizePx,
        widthCells,
        heightCells,
        isPublished,
      };
      // Optimistic update first.
      onScenePatched(patch);
      const ok = await scenesApi.updateScene(scene.id, patch);
      if (!ok) {
        showToast('Failed to save. Check console for details.', 'error');
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    // v2.241 — was window.confirm.
    const ok = await confirmModal({
      title: `Delete scene "${scene.name}"?`,
      message: 'This removes the scene and all tokens in it. This cannot be undone.',
      confirmLabel: 'Delete scene',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await scenesApi.deleteScene(scene.id);
      if (!result) {
        showToast('Failed to delete. Check console for details.', 'error');
        return;
      }
      onSceneDeleted(scene.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
  };

  const modalStyle: React.CSSProperties = {
    minWidth: 380,
    maxWidth: 480,
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg, 12px)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    fontFamily: 'var(--ff-body)',
    color: 'var(--t-1)',
    padding: 20,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--t-3)',
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--c-raised)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-sm, 4px)',
    color: 'var(--t-1)',
    fontFamily: 'var(--ff-body)',
    fontSize: 13,
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={backdropStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={stop}>
        <div style={{
          fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
          marginBottom: 16, color: 'var(--t-1)',
          textTransform: 'uppercase' as const,
        }}>
          Scene Settings
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            maxLength={80}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Grid (px)</label>
            <input
              type="number"
              value={gridSizePx}
              onChange={(e) => setGridSizePx(parseInt(e.target.value) || 0)}
              style={inputStyle}
              min={10}
              max={500}
            />
          </div>
          <div>
            <label style={labelStyle}>Width (cells)</label>
            <input
              type="number"
              value={widthCells}
              onChange={(e) => setWidthCells(parseInt(e.target.value) || 0)}
              style={inputStyle}
              min={1}
              max={200}
            />
          </div>
          <div>
            <label style={labelStyle}>Height (cells)</label>
            <input
              type="number"
              value={heightCells}
              onChange={(e) => setHeightCells(parseInt(e.target.value) || 0)}
              style={inputStyle}
              min={1}
              max={200}
            />
          </div>
        </div>

        {scene.backgroundStoragePath && (
          <button
            onClick={fitToImage}
            title="Auto-size the grid to match the uploaded map image's aspect at the current grid size"
            style={{
              padding: '5px 10px',
              background: 'rgba(96,165,250,0.15)',
              border: '1px solid rgba(96,165,250,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#60a5fa',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            Fit to map image
          </button>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--t-2)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            <span>Published (visible to players)</span>
          </label>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          paddingTop: 12, borderTop: '1px solid var(--c-border)',
        }}>
          <button
            onClick={doDelete}
            disabled={deleting}
            style={{
              padding: '6px 14px',
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#f87171',
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              cursor: deleting ? 'wait' : 'pointer',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete Scene'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                background: 'var(--c-raised)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'var(--t-2)',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '6px 14px',
                background: 'rgba(167,139,250,0.22)',
                border: '1px solid rgba(167,139,250,0.5)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#a78bfa',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * v2.226 — Token Quick Panel.
 *
 * Compact inline panel that opens when the DM (or any user) left-clicks
 * a token without dragging it. Shows core combat-relevant character
 * info at a glance: HP, AC, Speed, Conditions. Provides quick actions:
 *   - Damage / Heal / Set HP (DM only — writes to characters table)
 *   - Open full Character Sheet (router navigate)
 *   - Close
 *
 * Scope of v2.226: read-only HP/AC/Speed display + Damage/Heal/Set
 * controls + Open Sheet link. Conditions are shown as read-only chips.
 * v2.227+ will add inline condition apply/remove (which routes through
 * the combat-participants table — different from the characters table
 * that owns HP). Until then, condition changes happen on the full
 * character sheet or via the existing combat encounter UI.
 *
 * For tokens NOT linked to a character (NPCs, plain markers), the
 * panel is not opened; right-click context menu remains the way to
 * edit those.
 *
 * Position: anchored near the click point, but clamped so it never
 * goes off-screen. The panel has a fixed width and positions
 * itself with position:fixed.
 */
function TokenQuickPanel(props: {
  character: {
    id: string;
    name: string;
    class_name: string;
    level: number;
    current_hp: number;
    max_hp: number;
    armor_class: number;
    active_conditions: string[];
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    speed: number;
    // v2.229 — proficiency arrays so ChecksPanel can compute skill /
    // save modifiers and route Prompt Player correctly.
    saving_throw_proficiencies?: import('../../types').AbilityKey[];
    skill_proficiencies?: string[];
    skill_expertises?: string[];
  };
  anchorX: number;
  anchorY: number;
  isDM: boolean;
  // v2.229 — needed for ChecksPanel's "Prompt Player" → campaign_chat insert.
  campaignId: string;
  onClose: () => void;
  onOpenSheet: () => void;
}) {
  const { character: c, anchorX, anchorY, isDM, campaignId, onClose, onOpenSheet } = props;
  const { showToast } = useToast();
  const [hpInput, setHpInput] = useState('');
  const [hpMode, setHpMode] = useState<'damage' | 'heal' | 'set'>('damage');
  const [applying, setApplying] = useState(false);
  // v2.227 — guard for in-flight condition writes. Prevents double-click
  // from racing two updates against an out-of-date base array.
  const [condBusy, setCondBusy] = useState(false);

  // v2.280.0 — Per-DM collapse state for the Default Stats and Ability
  // Checks sections. Persisted in localStorage so the DM's preference
  // survives page reloads. Default `false` (sections start expanded)
  // so a first-time user sees the full panel; once they collapse it
  // the choice sticks. Stored under per-section keys so toggling one
  // doesn't affect the other.
  const STATS_COLLAPSED_KEY = 'dndkeep:tokenpanel:stats_collapsed';
  const CHECKS_COLLAPSED_KEY = 'dndkeep:tokenpanel:checks_collapsed';
  const [statsCollapsed, setStatsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(STATS_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [checksCollapsed, setChecksCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(CHECKS_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const toggleStatsCollapsed = () => {
    setStatsCollapsed(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(STATS_COLLAPSED_KEY, '1');
        else localStorage.removeItem(STATS_COLLAPSED_KEY);
      } catch { /* ignore quota / storage errors */ }
      return next;
    });
  };
  const toggleChecksCollapsed = () => {
    setChecksCollapsed(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(CHECKS_COLLAPSED_KEY, '1');
        else localStorage.removeItem(CHECKS_COLLAPSED_KEY);
      } catch { /* ignore */ }
      return next;
    });
  };

  // Esc closes the panel.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // HP percent for the bar fill.
  const pct = c.max_hp > 0 ? Math.max(0, Math.min(1, c.current_hp / c.max_hp)) : 0;
  const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';

  // Position calc: clamp inside viewport so panel doesn't fall off
  // the bottom or right edge. Width 280, max height ~360.
  const PANEL_W = 280;
  // v2.229 — bumped from 380 to 600 because the Checks panel adds
  // substantial content (skills + raw + saves + adv/dis/DC + actions).
  // With overflow:auto the panel still scrolls past this if needed.
  const PANEL_H = 600;
  const margin = 8;
  let left = Math.max(margin, anchorX + 14);
  if (typeof window !== 'undefined') {
    if (left + PANEL_W + margin > window.innerWidth) {
      left = Math.max(margin, anchorX - PANEL_W - 14);
    }
  }
  let top = Math.max(margin, anchorY - PANEL_H / 2);
  if (typeof window !== 'undefined') {
    if (top + PANEL_H + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - PANEL_H - margin);
    }
  }

  // Modifier helper — D&D 5e ability modifier formula.
  const mod = (score: number) => Math.floor((score - 10) / 2);
  const modStr = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  async function applyHp() {
    const n = parseInt(hpInput.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setApplying(true);
    try {
      let next = c.current_hp;
      if (hpMode === 'damage') next = Math.max(0, c.current_hp - n);
      else if (hpMode === 'heal') next = Math.min(c.max_hp, c.current_hp + n);
      else next = Math.max(0, Math.min(c.max_hp, n));
      const { error } = await supabase
        .from('characters')
        .update({ current_hp: next })
        .eq('id', c.id);
      if (error) {
        console.error('[TokenQuickPanel] HP update failed', error);
        showToast('Failed to update HP. Check console for details.', 'error');
        return;
      }
      setHpInput('');
    } finally {
      setApplying(false);
    }
  }

  // v2.227 — Direct write to characters.active_conditions (matches
  // v1's approach in BattleMap.tsx). Cascade rules from
  // src/lib/conditions.ts (Unconscious → Prone+Incapacitated, etc.)
  // are NOT applied here — same trade-off v1 makes. Cascades only
  // fire through the encounter pipeline (combat_participants); the
  // map-side panel is for quick adjustments, not full event-driven
  // condition changes. v2.228+ can route through applyCondition()
  // when a combat encounter is active.
  async function addCondition(cond: string) {
    if (condBusy) return;
    const current = c.active_conditions ?? [];
    if (current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = [...current, cond];
      const { error } = await supabase
        .from('characters')
        .update({ active_conditions: next })
        .eq('id', c.id);
      if (error) {
        console.error('[TokenQuickPanel] addCondition failed', error);
        showToast(`Failed to apply ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }

  async function removeCondition(cond: string) {
    if (condBusy) return;
    const current = c.active_conditions ?? [];
    if (!current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = current.filter(x => x !== cond);
      const { error } = await supabase
        .from('characters')
        .update({ active_conditions: next })
        .eq('id', c.id);
      if (error) {
        console.error('[TokenQuickPanel] removeCondition failed', error);
        showToast(`Failed to remove ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }

  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9997,
        // Backdrop is invisible but catches outside clicks to close.
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          position: 'fixed',
          left, top,
          width: PANEL_W,
          maxHeight: PANEL_H,
          overflowY: 'auto',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg, 12px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.25)',
          fontFamily: 'var(--ff-body)',
          color: 'var(--t-1)',
          padding: 14,
        }}
        onMouseDown={stop}
      >
        {/* Header — name, class/level, close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--t-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.04em', marginTop: 2 }}>
              {c.class_name} · Level {c.level}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 24, height: 24, padding: 0,
              background: 'transparent', border: 'none',
              color: 'var(--t-3)', cursor: 'pointer',
              fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* HP bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>HP</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: hpColor }}>
              {c.current_hp}<span style={{ fontSize: 10, color: 'var(--t-3)' }}>/{c.max_hp}</span>
            </span>
          </div>
          <div style={{
            height: 8, background: 'rgba(15,16,18,0.85)',
            border: '1px solid var(--c-border)',
            borderRadius: 4, overflow: 'hidden' as const,
          }}>
            <div style={{
              width: `${pct * 100}%`, height: '100%',
              background: hpColor, transition: 'width 0.2s, background 0.2s',
            }} />
          </div>
        </div>

        {/* v2.280.0 — Reordered. New flow:
              1. Header (above)
              2. HP bar (above)
              3. DM Controls (damage/heal/set)
              4. Open Character Sheet button (immediately below DM controls)
              5. Apply Condition picker (DM-only)
              6. Default Stats (AC, Speed, ability mods) — COLLAPSIBLE
              7. Ability Checks (ChecksPanel) — COLLAPSIBLE
              8. Active Conditions chips — moved to the bottom
            Pre-2.280 layout had Default Stats and ability mods up
            top (always visible) and Conditions just below them; that
            burned vertical real estate on info DMs rarely act on
            mid-combat. The frequently-needed surfaces (HP, DM
            controls, Open Sheet) are now above the fold; the
            informational surfaces collapse to a one-line header. */}

        {/* DM controls — damage / heal / set */}
        {isDM && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              DM Controls
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
              {(['damage', 'heal', 'set'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setHpMode(m)}
                  style={{
                    padding: '6px 4px',
                    background: hpMode === m
                      ? (m === 'damage' ? 'rgba(248,113,113,0.25)' : m === 'heal' ? 'rgba(52,211,153,0.25)' : 'rgba(167,139,250,0.25)')
                      : 'var(--c-raised)',
                    border: `1px solid ${hpMode === m
                      ? (m === 'damage' ? 'rgba(248,113,113,0.6)' : m === 'heal' ? 'rgba(52,211,153,0.6)' : 'rgba(167,139,250,0.6)')
                      : 'var(--c-border)'}`,
                    borderRadius: 'var(--r-sm, 4px)',
                    color: hpMode === m
                      ? (m === 'damage' ? '#f87171' : m === 'heal' ? '#34d399' : '#a78bfa')
                      : 'var(--t-2)',
                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                    textTransform: 'capitalize' as const, cursor: 'pointer',
                  }}
                >{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                value={hpInput}
                onChange={(e) => setHpInput(e.target.value)}
                placeholder="Amount"
                min={0}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'var(--c-raised)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: 'var(--t-1)',
                  fontFamily: 'var(--ff-body)', fontSize: 12,
                  boxSizing: 'border-box' as const,
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyHp(); }}
              />
              <button
                onClick={applyHp}
                disabled={applying || !hpInput.trim()}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(167,139,250,0.22)',
                  border: '1px solid rgba(167,139,250,0.5)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: '#a78bfa',
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  cursor: (applying || !hpInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (applying || !hpInput.trim()) ? 0.5 : 1,
                }}
              >
                {applying ? '…' : 'Apply'}
              </button>
            </div>
          </div>
        )}

        {/* v2.280.0 — Open full character sheet, moved up to sit
            directly below the DM Controls per spec. Renders for both
            DM and player surfaces; the navigation target itself
            handles permissions (RLS gates write access there). */}
        <button
          onClick={onOpenSheet}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'rgba(167,139,250,0.15)',
            border: '1px solid rgba(167,139,250,0.45)',
            borderRadius: 'var(--r-sm, 4px)',
            color: '#a78bfa',
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          Open Character Sheet →
        </button>

        {/* v2.227 — Apply Condition picker (DM only). Lists every
            condition NOT already active as a clickable color chip;
            click → write to characters.active_conditions → Realtime
            updates the parent → this panel re-renders with the
            condition moved into the "active" chip row above. */}
        {isDM && (() => {
          const activeSet = new Set(c.active_conditions ?? []);
          const remaining = ALL_CONDITIONS.filter(cond => !activeSet.has(cond));
          if (remaining.length === 0) return null;
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Apply Condition
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                {remaining.map(cond => {
                  const color = COND_COLOR[cond] ?? '#9ca3af';
                  return (
                    <button
                      key={cond}
                      onClick={() => addCondition(cond)}
                      title={`Apply ${cond}`}
                      disabled={condBusy}
                      style={{
                        padding: '2px 7px',
                        background: color + '11',
                        border: `1px solid ${color}44`,
                        borderRadius: 999,
                        fontSize: 9, fontWeight: 600,
                        color,
                        fontFamily: 'var(--ff-body)',
                        cursor: condBusy ? 'wait' : 'pointer',
                        opacity: condBusy ? 0.6 : 1,
                      }}
                    >
                      {cond}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* v2.280.0 — Default Stats: collapsible. AC + Speed grid +
            STR/DEX/CON/INT/WIS/CHA mods. Default expanded; collapsed
            state persisted per-DM in localStorage. The header row is
            click-to-toggle so the affordance is consistent with the
            Ability Checks section below. */}
        <div style={{ marginBottom: 12 }}>
          <div
            onClick={toggleStatsCollapsed}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', userSelect: 'none' as const, marginBottom: 6,
            }}
            title={statsCollapsed ? 'Expand default stats' : 'Collapse default stats'}
          >
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Default Stats
            </div>
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
              {statsCollapsed ? '▸' : '▾'}
            </span>
          </div>
          {!statsCollapsed && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { label: 'AC', value: c.armor_class },
                  { label: 'Speed', value: `${c.speed} ft` },
                ].map(stat => (
                  <div key={stat.label} style={{
                    padding: '6px 8px',
                    background: 'rgba(15,16,18,0.5)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 'var(--r-sm, 4px)',
                    textAlign: 'center' as const,
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-1)', marginTop: 2 }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {[
                  ['STR', c.strength],
                  ['DEX', c.dexterity],
                  ['CON', c.constitution],
                  ['INT', c.intelligence],
                  ['WIS', c.wisdom],
                  ['CHA', c.charisma],
                ].map(([k, v]) => {
                  const m = mod(v as number);
                  return (
                    <div key={k as string} style={{
                      padding: '4px 0',
                      background: 'rgba(15,16,18,0.5)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 'var(--r-sm, 4px)',
                      textAlign: 'center' as const,
                    }}>
                      <div style={{ fontSize: 8, color: 'var(--t-3)', letterSpacing: '0.04em' }}>{k as string}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-1)' }}>{modStr(m)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* v2.229 — Checks panel (DM only). v2.280.0: collapsible.
            Default expanded; persisted in localStorage. Same
            ChecksPanel component the Party tab renders, so the two
            surfaces stay structurally identical: skill picker, raw
            ability buttons, save buttons, adv/dis/DC controls,
            Roll Secret + Prompt Player. The character object is
            passed as-is (cast to Character — the slim shape from
            playerCharacters carries every field ChecksPanel reads). */}
        {isDM && (
          <div style={{ marginBottom: 12, paddingTop: 10, borderTop: '1px solid var(--c-border)' }}>
            <div
              onClick={toggleChecksCollapsed}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', userSelect: 'none' as const, marginBottom: 6,
              }}
              title={checksCollapsed ? 'Expand ability checks' : 'Collapse ability checks'}
            >
              <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Ability Checks
              </div>
              <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
                {checksCollapsed ? '▸' : '▾'}
              </span>
            </div>
            {!checksCollapsed && (
              <ChecksPanel character={c as unknown as Character} campaignId={campaignId} />
            )}
          </div>
        )}

        {/* v2.227 — Active conditions chips, moved to bottom in v2.280.
            DM clicks the ✕ to remove; players see them read-only.
            Color-coded via COND_COLOR matching v1's palette. Writes
            flow through the characters table directly (same path v1
            uses) — Realtime propagates back to this panel and to
            character sheets. Bottom placement is per-spec: conditions
            are status info, not the primary actionable surface. */}
        {c.active_conditions && c.active_conditions.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              Conditions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {c.active_conditions.map(cond => {
                const color = COND_COLOR[cond] ?? '#9ca3af';
                return (
                  <span
                    key={cond}
                    onClick={isDM ? () => removeCondition(cond) : undefined}
                    title={isDM ? `Remove ${cond}` : cond}
                    style={{
                      padding: '2px 8px',
                      background: color + '22',
                      border: `1px solid ${color}55`,
                      borderRadius: 999,
                      fontSize: 10, fontWeight: 700,
                      color,
                      cursor: isDM ? 'pointer' : 'default',
                      opacity: condBusy ? 0.6 : 1,
                      pointerEvents: condBusy ? 'none' : 'auto',
                      userSelect: 'none' as const,
                    }}
                  >
                    {cond}{isDM && ' ✕'}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// v2.286.0 — Legacy InitiativeBar component removed. It rendered
// ABOVE the canvas wrapper when sessionState.combat_active was true,
// driven by the legacy initiative_order on campaign_sessions. The
// modern InitiativeStrip mounts at the bottom of the page from
// CombatProvider and is the canonical surface for combat. Keeping
// both was a UX hazard — they could disagree if the legacy boolean
// got toggled without participants being seeded. The mount site
// (~line 6844 originally) was deleted in the same commit.


/**
 * v2.231.0 — Party Vitals strip.
 *
 * Always-on horizontal strip rendered BELOW the canvas wrapper
 * inside BattleMapV2. Read-only at-a-glance view: every PC in the
 * campaign appears as a card with name + HP bar + AC chip + spell-
 * slot pips (only for casters with at least one slot defined).
 *
 * No interactions — clicks/edits go through TokenQuickPanel (DM)
 * or the character's own sheet (player). This is purely "look,
 * don't touch" so the table stays compact and DMs can scan vitals
 * mid-combat without opening anything.
 *
 * Hides itself when there are no PCs to avoid an empty bar.
 */
// v2.270.0 — localStorage key for the floating party panel's
// collapsed state. Per-user (not per-campaign) since the preference
// is about UI density rather than table-specific state.
const PARTY_PANEL_COLLAPSED_KEY = 'dndkeep:battlemap_v2:party_panel_collapsed';

function PartyVitalsBar(props: {
  characters: BattleMapV2Props['playerCharacters'];
  /** v2.239.0 — clicking a card asks the parent to pan the map to
   *  this character's linked token. Optional: if absent (e.g. embed
   *  contexts where the bar is purely informational), the cards
   *  render non-interactive. */
  onCharacterClick?: (characterId: string) => void;
}) {
  const { characters, onCharacterClick } = props;

  // v2.270.0 — collapsed state, persisted across sessions. Lazy-init
  // from localStorage so we don't flash the wrong state on mount.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(PARTY_PANEL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(PARTY_PANEL_COLLAPSED_KEY, '1');
        else localStorage.removeItem(PARTY_PANEL_COLLAPSED_KEY);
      } catch { /* ignore quota / disabled-storage errors */ }
      return next;
    });
  }, []);

  if (!characters || characters.length === 0) return null;

  // v2.270.0 — common positioning for both collapsed handle and
  // expanded panel. Anchored bottom-left of the parent (the canvas
  // wrapper, which is position: relative). Bottom inset of 12px keeps
  // it off the canvas edge; left inset matches.
  const anchorStyle: React.CSSProperties = {
    position: 'absolute' as const,
    bottom: 12,
    left: 12,
    zIndex: 30, // above canvas, below modals (200+) and tooltips
  };

  if (collapsed) {
    // Compact handle: just a "Party (N)" pill. Click to expand.
    return (
      <button
        onClick={toggleCollapsed}
        title="Show party vitals"
        style={{
          ...anchorStyle,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          background: 'rgba(15,16,18,0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--c-border)',
          borderRadius: 999,
          fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          color: 'var(--t-2)',
          cursor: 'pointer',
          transition: 'background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.95)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border-m)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.85)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border)';
        }}
      >
        <span>👥</span>
        <span>Party · {characters.length}</span>
        <span style={{ opacity: 0.6, fontSize: 9 }}>▴</span>
      </button>
    );
  }

  return (
    <div
      style={{
        ...anchorStyle,
        // v2.270.0 — size to content with a max-width cap. Anchored
        // bottom-left; the help hint sits at bottom-right and the
        // two coexist as long as neither pushes past the other. The
        // max-width cap (calc 100% - 240px) leaves clearance for the
        // hint at the right; on narrow viewports the panel will
        // scroll its cards horizontally before bleeding into the
        // hint zone.
        maxWidth: 'calc(100% - 240px)',
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        padding: '8px 12px',
        // Translucent background so the canvas reads through. Higher
        // opacity than the cards inside so the panel chrome remains
        // legible.
        background: 'rgba(15,16,18,0.78)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-md, 8px)',
        overflowX: 'auto' as const,
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '0 6px',
        borderRight: '1px solid var(--c-border)',
        paddingRight: 12,
      }}>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: 'var(--t-3)',
        }}>
          Party
        </div>
        <button
          onClick={toggleCollapsed}
          title="Collapse party panel"
          style={{
            marginTop: 4,
            padding: '2px 8px',
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            color: 'var(--t-3)',
            fontSize: 10, fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-raised)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-3)';
          }}
        >
          ▾ Hide
        </button>
      </div>
      {characters.map(c => {
        const pct = c.max_hp > 0 ? Math.max(0, Math.min(1, c.current_hp / c.max_hp)) : 0;
        const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';
        // v2.280.0 — Spell slots removed from the in-canvas party panel.
        // Per-DM feedback: slot dots clutter the at-a-glance HP read,
        // and DMs cross-reference slots in the character sheet anyway.
        // The full slot UI continues to live in CharacterSheet
        // (player-side) and PartyDashboard (DM Party tab); only this
        // floating canvas overlay is HP-only now.
        return (
          <div
            key={c.id}
            onClick={onCharacterClick ? () => onCharacterClick(c.id) : undefined}
            title={onCharacterClick ? `Pan map to ${c.name}` : undefined}
            style={{
              flexShrink: 0,
              minWidth: 160,
              display: 'flex',
              flexDirection: 'column' as const,
              gap: 4,
              padding: '6px 10px',
              background: 'rgba(15,16,18,0.5)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm, 4px)',
              cursor: onCharacterClick ? 'pointer' : 'default',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={onCharacterClick ? (e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(96,165,250,0.08)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(96,165,250,0.4)';
            } : undefined}
            onMouseLeave={onCharacterClick ? (e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(15,16,18,0.5)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--c-border)';
            } : undefined}
          >
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: 'var(--ff-body)',
                fontSize: 12, fontWeight: 700,
                color: 'var(--t-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {c.name}
              </span>
              <span style={{
                flexShrink: 0,
                fontFamily: 'var(--ff-stat)',
                fontSize: 10, fontWeight: 700,
                color: 'var(--t-3)',
                padding: '1px 6px',
                background: 'rgba(96,165,250,0.15)',
                border: '1px solid rgba(96,165,250,0.4)',
                borderRadius: 'var(--r-sm, 4px)',
              }} title="Armor Class">
                AC {c.armor_class}
              </span>
            </div>

            {/* HP bar */}
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                fontSize: 9, fontWeight: 700, color: 'var(--t-3)',
                letterSpacing: '0.04em', textTransform: 'uppercase' as const,
              }}>
                <span>HP</span>
                <span style={{ color: hpColor }}>{c.current_hp}<span style={{ color: 'var(--t-3)' }}>/{c.max_hp}</span></span>
              </div>
              <div style={{
                height: 5,
                background: 'rgba(15,16,18,0.85)',
                border: '1px solid var(--c-border)',
                borderRadius: 3,
                overflow: 'hidden' as const,
                marginTop: 2,
              }}>
                <div style={{
                  width: `${pct * 100}%`, height: '100%',
                  background: hpColor, transition: 'width 0.2s, background 0.2s',
                }} />
              </div>
            </div>

            {/* v2.280.0 — Spell slots removed from this overlay. Slots
                continue to render in the full character sheet and the
                Party tab; the floating canvas panel is HP+AC only. */}
          </div>
        );
      })}
    </div>
  );
}

export default function BattleMapV2(props: BattleMapV2Props) {
  const { isDM, campaignId, userId } = props;

  // v2.222 — navigate to a linked character's full sheet from a token's
  // right-click menu. Uses the same /character/:id route the character
  // creator/lobby use. Memoized to keep TokenContextMenu props stable.
  const navigate = useNavigate();
  const handleOpenCharacter = useCallback((characterId: string) => {
    navigate(`/character/${characterId}`);
  }, [navigate]);

  // v2.240 — non-blocking toast handle. Used in this file to replace
  // the chain of `window.alert()` calls left over from earlier ships
  // with the existing toast UI (mounted at app root in App.tsx).
  const { showToast } = useToast();
  // v2.241 — non-blocking modal handles for prompts/confirms (replaces
  // window.prompt and window.confirm in this file). Single-modal-at-a-
  // time semantics; opening a second cancels the first. ModalProvider
  // is mounted at app root in App.tsx.
  const { prompt: promptModal, confirm: confirmModal } = useModal();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  // v2.281.0 — pseudo-fullscreen toggle. When true the wrapper goes
  // position:fixed inset:0 to take over the viewport without invoking
  // the browser's native fullscreen API (which would hide portaled
  // overlays like the InitiativeStrip, dice/log buttons, toasts, and
  // modals — all of which mount via document.body). The CSS approach
  // keeps every portal layer correctly stacked above the map.
  // Persisted per-user in localStorage so the choice survives page
  // reloads. Esc exits fullscreen as a convenience.
  const FULLSCREEN_KEY = 'dndkeep:battlemap:fullscreen';
  const [mapFullscreen, setMapFullscreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(FULLSCREEN_KEY) === '1'; } catch { return false; }
  });
  const toggleMapFullscreen = useCallback(() => {
    setMapFullscreen(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(FULLSCREEN_KEY, '1');
        else localStorage.removeItem(FULLSCREEN_KEY);
      } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Esc exits fullscreen. Doesn't interfere with other Esc handlers
  // because they generally check for an open modal/menu first; this
  // listener only acts when fullscreen is on AND no other Esc-eating
  // surface is mounted. We can't easily detect "another modal open"
  // from here without coupling, so we just check our own state and
  // bail otherwise — the cost of double-handling Esc (closing both
  // a popup and exiting fullscreen) is acceptably minor.

  // v2.313.0 — Combat Phase 3 pt 5: per-campaign feature flag. When
  // true, this BattleMap reads/writes through scenePlacements.ts
  // (placements + combatants) instead of sceneTokens.ts. Hydrated by
  // the scene-load effect after fetching campaigns.use_combatants_for_battlemap
  // and used by the realtime subscription effect to choose which
  // table to subscribe to. Defaults false so the legacy path stays
  // active until the DM opts in. Flip via SQL during dogfooding —
  // a UI toggle in CampaignSettings is queued for a follow-up ship.
  const [useNewPath, setUseNewPath] = useState(false);
  useEffect(() => {
    if (!mapFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMapFullscreen(false);
        try { localStorage.removeItem(FULLSCREEN_KEY); } catch { /* ignore */ }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mapFullscreen]);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // v2.358.0 — Token selection (left-click without drag). Local-only
  // UI state; not persisted, not sync'd across users. Shows a thin
  // cyan ring around the selected token to distinguish from the
  // active-turn gold ring (which is sync'd / driven by initiative).
  // Clicking a different token replaces selection; Escape clears it;
  // right-click → "Open Quick Panel" is how the DM accesses the
  // character/NPC quick panel that left-click used to open before
  // this ship.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  // Escape clears selection. Bails on text inputs so a user typing
  // in the rename modal can press Escape to dismiss the modal
  // without also wiping their selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      }
      setSelectedTokenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // v2.226 — left-click-without-drag opens the TokenQuickPanel for
  // character-linked tokens. State holds the tokenId + screen pos
  // so the panel can be anchored near the click.
  const [clickedToken, setClickedToken] = useState<{
    tokenId: string;
    x: number;
    y: number;
  } | null>(null);
  // v2.243 — separate state for NPC-linked token clicks. The NPC
  // panel reads from `npcs` and is structurally different from the
  // character TokenQuickPanel (no class/level/abilities/checks),
  // so it gets its own state slot. Mutually exclusive with
  // clickedToken — opening one clears the other.
  // v2.386.0 — tokenId added so the panel can act on the specific
  // scene_tokens row that was clicked. Previously the panel only
  // had npcId (creature_id), which is fine for HP/conditions but
  // the wrong granularity for the per-token visibility toggle.
  const [clickedNpcToken, setClickedNpcToken] = useState<{
    npcId: string;
    tokenId: string;
    x: number;
    y: number;
  } | null>(null);

  // v2.215 — portrait upload state. fileInputRef drives the hidden
  // <input type="file">; uploadTargetIdRef holds which token the next
  // file-select applies to; uploadingTokenId gates the "UPLOADING…"
  // banner during the async upload round-trip.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetIdRef = useRef<string | null>(null);
  const [uploadingTokenId, setUploadingTokenId] = useState<string | null>(null);

  // Called by the context menu when the user picks "Upload portrait…".
  // Records which token the resulting file will apply to and opens the
  // native file picker.
  const handleRequestUpload = useCallback((tokenId: string) => {
    uploadTargetIdRef.current = tokenId;
    fileInputRef.current?.click();
  }, []);

  // Called when the file input onChange fires. Validates, uploads,
  // updates the token, then persists via tokensApi.updateToken. The
  // Realtime subscription will echo the update back for this client
  // (idempotent) and forward to all other clients in the scene.
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still triggers onChange.
    e.target.value = '';
    const tokenId = uploadTargetIdRef.current;
    uploadTargetIdRef.current = null;
    if (!file || !tokenId) return;

    // Redundant client validation — matches the bucket's allowed list.
    if (!assetsApi.ACCEPTED_PORTRAIT_MIME.includes(file.type)) {
      showToast(`Unsupported file type: ${file.type}. Use PNG, JPEG, WebP, or GIF.`, 'warn');
      return;
    }
    if (file.size > assetsApi.MAX_PORTRAIT_BYTES) {
      showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`, 'warn');
      return;
    }

    setUploadingTokenId(tokenId);
    try {
      const path = await assetsApi.uploadTokenPortrait(file, userId, tokenId);
      if (!path) {
        showToast('Upload failed. Check the browser console for details.', 'error');
        return;
      }
      // Optimistic local update.
      useBattleMapStore.getState().updateTokenFields(tokenId, { imageStoragePath: path });
      // Commit to DB — Realtime echoes back to all clients.
      tokensApi.updateToken(tokenId, { imageStoragePath: path }).catch(err =>
        console.error('[BattleMapV2] portrait path commit failed', err)
      );
    } finally {
      setUploadingTokenId(null);
    }
  }, [userId]);

  // v2.213: scene list + currently-selected scene. Scenes are fetched
  // on mount and on campaign change.
  const [scenes, setScenes] = useState<scenesApi.Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<scenesApi.Scene | null>(null);
  const [scenesLoading, setScenesLoading] = useState(true);
  const loading = useBattleMapStore(s => s.loading);

  // v2.255.0 — undo/redo stack for drawings + texts. Scene-scoped
  // (history resets on scene switch). Bound to Cmd-Z / Cmd-Shift-Z
  // by the hook's own keyboard listener; we just consume `record`
  // and pass it down to TextLayer + DrawingLayer.
  // v2.358.0 — also consume `undo` + `canUndo` + `lastActionLabel`
  // for the floating "Undo Last Move" button rendered in the bottom-
  // right corner of the map. Per user request: undo affordance lives
  // in the log corner, not just behind a keybind.
  const { record: recordUndoable, undo: undoLast, canUndo, lastActionLabel } = useUndoRedo(currentScene?.id ?? null);

  // Derive world dimensions from the current scene (fallback to
  // defaults so the empty-state screen still renders a reasonable
  // placeholder grid behind the CTA).
  const gridSizePx = currentScene?.gridSizePx ?? DEFAULT_GRID_SIZE_PX;
  const widthCells = currentScene?.widthCells ?? DEFAULT_WIDTH_CELLS;
  const heightCells = currentScene?.heightCells ?? DEFAULT_HEIGHT_CELLS;
  const WORLD_WIDTH = gridSizePx * widthCells;
  const WORLD_HEIGHT = gridSizePx * heightCells;

  // Fetch scenes on mount / campaign change.
  useEffect(() => {
    let cancelled = false;
    setScenesLoading(true);
    scenesApi.listScenes(campaignId).then(list => {
      if (cancelled) return;
      setScenes(list);
      // Auto-select the first scene if none is selected yet.
      if (list.length > 0) {
        setCurrentScene(prev => prev ?? list[0]);
      }
      setScenesLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Hydrate tokens when the current scene changes.
  useEffect(() => {
    const store = useBattleMapStore.getState();
    if (!currentScene) {
      store.resetForScene(null);
      store.setTokensBulk([]);
      store.setWallsBulk([]);
      return;
    }
    let cancelled = false;
    store.setLoading(true);
    store.resetForScene(currentScene.id);
    // v2.313.0 — Combat Phase 3 pt 5: chain flag fetch before
    // listTokens so the router knows which path to use. Walls/texts/
    // drawings hydrate in parallel below as before — they're not
    // affected by the Phase 3 swap.
    (async () => {
      let flag = false;
      try {
        flag = await getUseCombatantsFlag(campaignId);
      } catch (err) {
        // Default to legacy path on flag-fetch errors so a transient
        // outage doesn't silently switch render modes.
        console.error('[BattleMapV2] getUseCombatantsFlag failed', err);
      }
      if (cancelled) return;
      setUseCombatantsPath(flag);
      setUseNewPath(flag);
      const list = await tokensApi.listTokens(currentScene.id);
      if (cancelled) return;
      useBattleMapStore.getState().setTokensBulk(list);
      useBattleMapStore.getState().setLoading(false);
    })();
    // v2.223 — walls hydration runs in parallel with tokens. No
    // loading gate for walls specifically; they populate when ready.
    wallsApi.listWalls(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setWallsBulk(list);
    });
    // v2.234 — texts hydration parallel to walls.
    textsApi.listTexts(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setTextsBulk(list);
    });
    // v2.235 — drawings hydration parallel to walls/texts.
    drawingsApi.listDrawings(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setDrawingsBulk(list);
    });
    return () => { cancelled = true; };
  }, [currentScene]);

  // v2.214.0 — Phase Q.1 pt 7: Realtime sync for scene_tokens.
  // When any client commits a token change (add / move / edit / delete),
  // Supabase Postgres Changes fires an event here and we apply it to the
  // Zustand store. RLS filters — each subscriber only receives events
  // for rows they could SELECT, so no sensitive tokens leak to players
  // who shouldn't see them.
  //
  // Idempotency: the originating client also receives its own events.
  // Since `addToken` is an upsert (spread + set by id) and the payload
  // data matches the client's optimistic state, the re-apply is a no-op.
  // No special filtering needed.
  //
  // Race window: there's a brief gap (typically <200ms) between
  // subscription setup and listTokens resolving where a new INSERT
  // event could be superseded by setTokensBulk's wholesale replacement.
  // Acceptable for v2.214; v2.215 can introduce a merge strategy.
  //
  // v2.313.0 — Combat Phase 3 pt 5: when useNewPath is true, the
  // subscription targets scene_token_placements. INSERT/UPDATE
  // payloads from that table don't include the JOINed combatant
  // data, so the handler re-fetches the full list via the router
  // (bounded scenes; ~50 tokens is the realistic upper bound and the
  // round-trip cost is acceptable). DELETE payloads carry only the
  // primary key, which is enough to drop from the store.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const tableName = useNewPath ? 'scene_token_placements' : 'scene_tokens';
    let cancelled = false;
    const channel = supabase
      .channel(`battle_map:${tableName}:${sceneId}`)
      .on(
        // Supabase types lag behind runtime; cast to bypass the literal.
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `scene_id=eq.${sceneId}`,
        },
        async (payload: any) => {
          const store = useBattleMapStore.getState();
          // Ignore events for tokens belonging to a different scene —
          // the filter should already handle this but defense-in-depth
          // against filter semantics changing.
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRow = payload.new;
            if (newRow?.scene_id !== sceneId) return;
            if (useNewPath) {
              // The placement realtime payload doesn't carry the
              // combatants JOIN. Re-fetch via the router so the store
              // sees the merged Token shape. v2.314+ may do a
              // single-row JOINed fetch by id for tighter cost.
              const list = await tokensApi.listTokens(sceneId);
              if (cancelled) return;
              useBattleMapStore.getState().setTokensBulk(list);
            } else {
              store.addToken(dbRowToToken(newRow));
            }
          } else if (payload.eventType === 'DELETE') {
            // For DELETE with REPLICA IDENTITY DEFAULT (Postgres default),
            // payload.old contains only the primary key. That's all we need.
            const oldRow = payload.old;
            if (oldRow?.id) {
              store.removeToken(oldRow.id);
            }
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id, useNewPath]);

  // v2.314.0 — Combat Phase 3 pt 6: combatants realtime subscription.
  // The placement subscription above only fires on placement-row
  // changes — it doesn't see UPDATEs to the linked combatant (e.g.,
  // a rename writes to combatants.name, not the placement). Without
  // this second channel, multi-client rename propagation is broken
  // (the DM's own UI sees the rename via optimistic state, but other
  // clients keep showing the old name until they reload).
  //
  // The dual-write trigger from v2.311 also writes HP/condition
  // changes to combatants whenever a combat_participants row is
  // updated. We don't want every HP tick to trigger a full token
  // re-fetch, so the handler filters on a name-change predicate
  // (and portrait_storage_path, which also affects token render)
  // before refreshing. HP/conditions/buffs/etc. updates are skipped
  // because the BattleMap doesn't currently render those on tokens
  // — they're shown elsewhere (initiative strip, character sheet).
  // If a future feature shows HP on tokens, expand the predicate.
  //
  // Filter: campaign_id=eq.${campaignId}. RLS still applies on top.
  useEffect(() => {
    if (!useNewPath || !campaignId) return;
    let cancelled = false;
    const channel = supabase
      .channel(`battle_map:combatants:${campaignId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'combatants',
          filter: `campaign_id=eq.${campaignId}`,
        },
        async (payload: any) => {
          // Skip if neither name nor portrait changed. The dual-write
          // trigger fires on HP/condition changes which we don't
          // visualize on the map.
          const oldRow = payload.old ?? {};
          const newRow = payload.new ?? {};
          const visualChanged =
            oldRow.name !== newRow.name ||
            oldRow.portrait_storage_path !== newRow.portrait_storage_path;
          if (!visualChanged) return;
          if (!currentScene?.id) return;
          // Only refresh if this combatant has a placement on the
          // current scene. Avoids refreshing for combatants that
          // only exist in other scenes or in combat-only state.
          const tokens = useBattleMapStore.getState().tokens;
          const onScene = Object.values(tokens).some(
            (t) => t.combatantId === newRow.id
          );
          if (!onScene) return;
          const list = await tokensApi.listTokens(currentScene.id);
          if (cancelled) return;
          useBattleMapStore.getState().setTokensBulk(list);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId, useNewPath, currentScene?.id]);

  // v2.223.0 — Phase Q.1 pt 16: Realtime sync for scene_walls.
  // Same pattern as scene_tokens. INSERTs (wall drawn) fire addWall on
  // all subscribers; DELETEs fire removeWall. No UPDATE handler in
  // this ship — walls are currently immutable (draw + delete, no edit).
  // v2.226+ door-state changes will add UPDATE handling.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_walls:${sceneId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_walls',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const wall = wallsApi.dbRowToWall(payload.new);
            // addWall is upsert semantics — safe for the originator's
            // own echo (idempotent) and for remote inserts alike.
            store.addWall(wall);
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old;
            if (oldRow?.id) {
              store.removeWall(oldRow.id);
            }
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

  // v2.234.0 — Realtime sync for scene_texts. Parallel to scene_walls
  // but with UPDATE handling because text rows DO mutate (rename via
  // double-click edit). Idempotent: addText/updateText with the same
  // payload is a no-op if state matches, so the originator echo is safe.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_texts:${sceneId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_texts',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          if (payload.eventType === 'INSERT') {
            store.addText(textsApi.dbRowToSceneText(payload.new));
          } else if (payload.eventType === 'UPDATE') {
            store.updateText(payload.new.id, textsApi.dbRowToSceneText(payload.new));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old;
            if (oldRow?.id) store.removeText(oldRow.id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

  // v2.235.0 — Realtime sync for scene_drawings. Drawings are immutable
  // (insert + delete only). Same pattern as scene_walls; no UPDATE.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_drawings:${sceneId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_drawings',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          if (payload.eventType === 'INSERT') {
            store.addDrawing(drawingsApi.dbRowToSceneDrawing(payload.new));
          } else if (payload.eventType === 'UPDATE') {
            // v2.255.0 — drawings are now mutable (drag-to-reposition).
            // Project the row through the same mapper as INSERT so
            // the local cache stays consistent with the DB shape.
            store.updateDrawing(payload.new.id, drawingsApi.dbRowToSceneDrawing(payload.new));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old;
            if (oldRow?.id) store.removeDrawing(oldRow.id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

  // v2.214.0 — Phase Q.1 pt 7: Realtime sync for scenes.
  // When a DM creates a new scene or publishes/unpublishes one, all
  // campaign members see the scenes list update. Players who don't
  // have permission via RLS silently won't receive unpublished scenes.
  useEffect(() => {
    if (!campaignId) return;
    const channel = supabase
      .channel(`battle_map:scenes:${campaignId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scenes',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new;
            const scene: scenesApi.Scene = {
              id: newRow.id,
              campaignId: newRow.campaign_id,
              ownerId: newRow.owner_id,
              name: newRow.name,
              gridType: newRow.grid_type,
              gridSizePx: newRow.grid_size_px,
              widthCells: newRow.width_cells,
              heightCells: newRow.height_cells,
              backgroundStoragePath: newRow.background_storage_path,
              dmNotes: newRow.dm_notes,
              isPublished: newRow.is_published,
              // v2.274.0 — ambient_light defaults to 'dark' if missing.
              ambientLight: newRow.ambient_light ?? 'dark',
              createdAt: newRow.created_at,
              updatedAt: newRow.updated_at,
            };
            setScenes(prev => {
              // Avoid dupes in case the originator's state already
              // includes this scene from its own create flow.
              if (prev.some(s => s.id === scene.id)) return prev;
              return [...prev, scene];
            });
          } else if (payload.eventType === 'UPDATE') {
            const newRow = payload.new;
            setScenes(prev => prev.map(s => s.id === newRow.id ? {
              ...s,
              name: newRow.name,
              gridSizePx: newRow.grid_size_px,
              widthCells: newRow.width_cells,
              heightCells: newRow.height_cells,
              backgroundStoragePath: newRow.background_storage_path,
              dmNotes: newRow.dm_notes,
              isPublished: newRow.is_published,
              // v2.274.0 — pull ambient_light through realtime so the
              // DM's lighting toggle reaches all connected players
              // without a refetch.
              ambientLight: newRow.ambient_light ?? 'dark',
              updatedAt: newRow.updated_at,
            } : s));
            // If the currently-selected scene was renamed / retuned,
            // reflect that in `currentScene` too.
            setCurrentScene(prev => prev && prev.id === newRow.id ? {
              ...prev,
              name: newRow.name,
              gridSizePx: newRow.grid_size_px,
              widthCells: newRow.width_cells,
              heightCells: newRow.height_cells,
              backgroundStoragePath: newRow.background_storage_path,
              dmNotes: newRow.dm_notes,
              isPublished: newRow.is_published,
              ambientLight: newRow.ambient_light ?? 'dark',
              updatedAt: newRow.updated_at,
            } : prev);
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (!oldId) return;
            setScenes(prev => prev.filter(s => s.id !== oldId));
            // If the deleted scene was selected, fall back to null;
            // the empty-state screen or auto-select will handle recovery.
            setCurrentScene(prev => prev && prev.id === oldId ? null : prev);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  // v2.216.0 — Phase Q.1 pt 9: drag channel (Broadcast + Presence).
  //
  // One Realtime channel per scene, carrying two kinds of traffic:
  //   (a) Broadcast `drag_move` events at ~20Hz with {tokenId, x, y,
  //       senderId}. Peers apply to their Zustand store as preview;
  //       senders ignore their own echo to avoid self-feedback loops.
  //   (b) Presence state `{ userId, draggingTokenId }` tracking who's
  //       currently mid-drag on which token. Receivers rebuild a
  //       `remoteDragLocks` map (tokenId → userId) on 'sync' events.
  //       Presence auto-cleans on disconnect (Phoenix Tracker CRDT).
  //
  // The channel is rebuilt on scene change; presence state from the
  // previous scene doesn't carry over. userId is stable across
  // scenes, so we track() fresh on each subscription.
  const dragChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!currentScene?.id || !userId) return;
    const sceneId = currentScene.id;
    const channel = supabase.channel(`battle_map:scene_drag:${sceneId}`, {
      config: {
        presence: { key: userId },
      },
    });

    channel.on('broadcast', { event: 'drag_move' }, (msg: any) => {
      const payload = msg?.payload;
      if (!payload) return;
      // Ignore our own echoes — we already updated the local store
      // optimistically in the drag handler.
      if (payload.senderId === userId) return;
      if (typeof payload.tokenId !== 'string') return;
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
      useBattleMapStore.getState().updateTokenPosition(payload.tokenId, payload.x, payload.y);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const locks: Record<string, string> = {};
      for (const presences of Object.values(state) as any[]) {
        for (const p of presences) {
          if (p?.draggingTokenId && typeof p.userId === 'string') {
            locks[p.draggingTokenId] = p.userId;
          }
        }
      }
      useBattleMapStore.getState().setRemoteDragLocks(locks);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Initial presence entry — no drag yet.
        await channel.track({ userId, draggingTokenId: null });
      }
    });

    dragChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      dragChannelRef.current = null;
    };
  }, [currentScene?.id, userId]);

  // Callbacks passed down to TokenLayer. Each one pokes the channel —
  // no-op if the channel isn't yet subscribed.
  const handleDragStart = useCallback((tokenId: string) => {
    dragChannelRef.current?.track({ userId, draggingTokenId: tokenId });
  }, [userId]);

  const handleDragMove = useCallback((tokenId: string, x: number, y: number) => {
    dragChannelRef.current?.send({
      type: 'broadcast',
      event: 'drag_move',
      payload: { tokenId, x, y, senderId: userId },
    });
  }, [userId]);

  const handleDragEnd = useCallback((tokenId: string) => {
    // Clear the drag lock. We keep our presence entry itself so other
    // users still see us as connected; just update draggingTokenId.
    dragChannelRef.current?.track({ userId, draggingTokenId: null });
    // Also clear locally in case the presence 'sync' event is slow —
    // otherwise the indicator might persist until the next sync.
    useBattleMapStore.setState((s) => {
      if (s.remoteDragLocks[tokenId]) {
        const { [tokenId]: _, ...rest } = s.remoteDragLocks;
        return { remoteDragLocks: rest };
      }
      return s;
    });
  }, [userId]);

  // v2.268.0 — fired when a drag is rejected because it crosses a
  // movement-blocking wall. Surface a toast so the player knows the
  // snap-back wasn't a UI glitch. Cooldown via the toast system's own
  // dedup if it has one; otherwise rapid-fire reject attempts will
  // stack toasts (acceptable: rare, and self-explanatory).
  const handleMovementBlocked = useCallback(() => {
    showToast('A wall blocks that path.', 'warn');
  }, [showToast]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // v2.270.0 — was: width × 0.5625 (16:9), capped at 700px max.
    // v2.281.0 — bigger default + fullscreen support. The previous
    // 0.78 ratio felt cramped on tall monitors; bumped to 0.86 for
    // the standard layout, and the cap from 1100 → 1400 so 1440p+
    // displays can use more vertical real estate. When mapFullscreen
    // is on the canvas takes essentially the whole viewport
    // (height = innerHeight - 8 to keep a hairline border visible).
    // Width still comes from the wrapper's own clientWidth, which
    // becomes 100vw because the wrapper is position:fixed inset:0
    // when fullscreen is on.
    const computeDims = () => {
      const w = Math.max(300, Math.floor(el.clientWidth));
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
      let h: number;
      if (mapFullscreen) {
        h = Math.max(400, viewportH - 8);
      } else {
        // v2.360.0 — Settled at 0.92 of viewport height. Path:
        //   v2.336: 0.92 (baseline that worked)
        //   v2.356: 0.96 (user said "still small")
        //   v2.357: 0.96 (held — no measurements)
        //   v2.358: 0.99 (aggressive — pushed under tab strip,
        //     hid the left-side floating tools toolbar)
        //   v2.359: 0.99 (held)
        //   v2.360: 0.92 (rolled back). User feedback: "tools are
        //     hidden because the map is too small" (i.e. too big,
        //     pushing tools off-screen). The right answer for "bigger
        //     map" is the existing fullscreen mode, which gives 100%
        //     viewport coverage with no chrome competing. Default
        //     layout keeps room for the floating tools + InitiativeStrip.
        //   v2.393: 0.95 — user requested bigger again. Compromise
        //     between 0.92 and 0.96 that adds ~30-50px of vertical
        //     real estate on a 1080p monitor without going aggressive
        //     enough to hide the tools toolbar (the failure mode in
        //     v2.358-v2.359). Cap raised 1400→1600 so tall monitors
        //     get the benefit too. Fullscreen mode remains the right
        //     answer when the DM wants the full canvas.
        const targetH = Math.floor(viewportH * 0.95);
        h = Math.max(400, Math.min(targetH, 1600));
      }
      setDims({ width: w, height: h });
    };
    const ro = new ResizeObserver(() => computeDims());
    ro.observe(el);
    // ResizeObserver only fires on the wrapper's own size; window
    // height changes don't change the wrapper box on the standard
    // layout, so a separate window listener catches that case. (In
    // fullscreen the wrapper IS the viewport, so RO would fire too,
    // but the window listener is harmless redundancy.)
    const onWinResize = () => computeDims();
    window.addEventListener('resize', onWinResize);
    // Force one immediate recompute so toggling fullscreen updates
    // dims even if the wrapper's clientWidth happens to be unchanged
    // (it isn't, in practice — but defensively explicit).
    computeDims();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, [mapFullscreen]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let attempts = 0;
    const id = setInterval(() => {
      const canvas = el.querySelector('canvas');
      if (canvas) {
        setCanvasEl(canvas as HTMLCanvasElement);
        clearInterval(id);
      } else if (++attempts > 30) {
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [dims.width, dims.height, currentScene?.id]);

  const vpRef = useRef<Viewport | null>(null);
  const zoomIn = useCallback(() => {
    if (!vpRef.current) return;
    vpRef.current.setZoom(Math.min(4, vpRef.current.scale.x * 1.2), true);
  }, []);
  const zoomOut = useCallback(() => {
    if (!vpRef.current) return;
    vpRef.current.setZoom(Math.max(0.25, vpRef.current.scale.x / 1.2), true);
  }, []);
  const zoomFit = useCallback(() => {
    if (!vpRef.current) return;
    const fitScale = Math.min(dims.width / WORLD_WIDTH, dims.height / WORLD_HEIGHT) * 0.9;
    vpRef.current.setZoom(fitScale, true);
    vpRef.current.moveCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }, [dims.width, dims.height, WORLD_WIDTH, WORLD_HEIGHT]);

  // v2.345.0 — Free-aim direction picker for cone/line spell targeting.
  //
  // When the spell picker activates direction-pick mode, this effect
  // attaches a one-shot click listener on the canvas. The click is
  // converted to world-pixel coords via vpRef.current.toWorld(),
  // written to store.directionPick.result, and direction-pick mode is
  // auto-deactivated. The picker reads the result on its next render.
  //
  // Capture phase + stopImmediatePropagation: critical. The map has
  // many click consumers (tokens, walls, drawing tools); without
  // capture-phase intercept a click on a token would also trigger
  // token-click. Direction-pick is "where on the canvas, ignore what's
  // there" — we win the race and stop propagation.
  //
  // CSS cursor flips to crosshair while active so the player has a
  // clear "click to aim" affordance; restored on deactivate.
  const directionPickActiveStore = useBattleMapStore(s => s.directionPick.active);
  const setDirectionPickResultStore = useBattleMapStore(s => s.setDirectionPickResult);
  const setDirectionPickActiveStore = useBattleMapStore(s => s.setDirectionPickActive);
  useEffect(() => {
    if (!canvasEl || !directionPickActiveStore) return;
    const prevCursor = canvasEl.style.cursor;
    canvasEl.style.cursor = 'crosshair';
    function onClick(e: MouseEvent) {
      const vp = vpRef.current;
      if (!canvasEl || !vp) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = vp.toWorld(screenX, screenY);
      setDirectionPickResultStore({ worldX: worldPoint.x, worldY: worldPoint.y });
      setDirectionPickActiveStore(false);
    }
    canvasEl.addEventListener('click', onClick, true);
    return () => {
      if (canvasEl) {
        canvasEl.removeEventListener('click', onClick, true);
        canvasEl.style.cursor = prevCursor;
      }
    };
  }, [canvasEl, directionPickActiveStore, setDirectionPickResultStore, setDirectionPickActiveStore]);

  // v2.239.0 — Pan-to-token. Click a PartyVitalsBar card → camera
  // animates to that PC's linked token on the current scene. Lifts
  // the vitals bar from "info display" to "navigation control" with
  // no schema, no Realtime — pure local Pixi viewport animation.
  //
  // Lookup: the store keeps tokens keyed by token id, but the link
  // we have is character id. We walk Object.values once per click;
  // token counts are typically small (<50) so the linear scan is
  // fine. We also filter to the current scene so a PC's stale token
  // on another scene doesn't pull the camera.
  //
  // If the character isn't placed on the current scene, the click
  // is a no-op (silently). Future polish: flash a "no token placed"
  // toast once the toast system lands.
  //
  // Animation: viewport.animate({position}) pans the viewport CENTER
  // to (x, y). 400ms feels snappy but smooth; default easing reads
  // natural. Zoom stays where the user left it — opinionated choice
  // (forced auto-zoom is jarring when you just want to "find that
  // PC"). If the player is zoomed way out, they'll see the token
  // recenter without losing their orientation.
  const panToCharacter = useCallback((characterId: string) => {
    const vp = vpRef.current;
    if (!vp || !currentScene) return;
    const sceneId = currentScene.id;
    const tokens = useBattleMapStore.getState().tokens;
    const target = Object.values(tokens).find(
      t => t.sceneId === sceneId && t.characterId === characterId,
    );
    if (!target) {
      // v2.240 — replace the previous silent no-op with a toast so the
      // user knows why nothing happened. Look up the character name
      // from the props array for a friendlier message.
      const char = props.playerCharacters.find(c => c.id === characterId);
      showToast(
        `${char?.name ?? 'That character'} has no token on this scene.`,
        'info',
      );
      return;
    }
    vp.animate({
      position: { x: target.x, y: target.y },
      time: 400,
      removeOnInterrupt: true,
    });
  }, [currentScene, props.playerCharacters, showToast]);

  // v2.385.0 — External pan-request consumer. The InitiativeStrip
  // (and other dashboard-level UI that doesn't have a viewport ref)
  // can call useBattleMapStore.getState().requestPan(x, y) to nudge
  // the camera. We watch the nonce, animate, and clear. Same 400ms
  // duration as panToCharacter — keeps both flows feeling identical.
  // We also zoom in to a comfortable read-the-token level on the
  // first pan: per the user's spec, "enough to where it shows that
  // character and maybe one other that is closest to them".
  //
  // Cold-mount safety: the InitiativeStrip lives at the dashboard
  // level. If the user clicks a tile while on a non-map tab, the
  // dashboard switches to the map tab and BattleMapV2 mounts at
  // about the same time. vpRef.current is assigned inside a render
  // callback that hasn't run yet on the first effect tick, so we
  // rAF-poll for up to ~1s before giving up. After that the
  // request is cleared so it doesn't re-fire on the next render.
  const panRequest = useBattleMapStore(s => s.panRequest);
  useEffect(() => {
    if (!panRequest) return;
    let raf = 0;
    let attempts = 0;
    const TARGET_CELLS_VISIBLE = 5;
    const desiredWorldVisible = TARGET_CELLS_VISIBLE * gridSizePx;
    function tryPan() {
      const vp = vpRef.current;
      if (!vp || vp.screenWidth === 0) {
        if (attempts++ < 60) {
          raf = requestAnimationFrame(tryPan);
          return;
        }
        // Gave up — clear so future requests still fire.
        useBattleMapStore.getState().clearPanRequest();
        return;
      }
      const screenShorter = Math.min(vp.screenWidth, vp.screenHeight);
      const desiredScale = screenShorter / desiredWorldVisible;
      // Don't force a zoom-OUT — only zoom in if the user is already
      // way out. (If they're zoomed past our target, leave them alone.)
      const finalScale = Math.max(vp.scale.x, desiredScale);
      vp.animate({
        position: { x: panRequest!.worldX, y: panRequest!.worldY },
        scale: finalScale,
        time: 400,
        removeOnInterrupt: true,
      });
      useBattleMapStore.getState().clearPanRequest();
    }
    tryPan();
    return () => cancelAnimationFrame(raf);
  }, [panRequest, gridSizePx]);

  // v2.213 — "+ Add Token" callback. REMOVED in v2.353.0 along with
  // its toolbar button. The original implementation created default
  // placeholder tokens (named "Token 1", "Token 2") with no creature
  // linkage, which conflicts with the unified flow where everything
  // on the map should be a player character or a creature from the
  // NPC section. v2.354 will add a fresh placement helper that
  // takes a creature_id.

  // v2.220 — "+ Add PC Tokens". Bulk-creates tokens for every player
  // character in the campaign that doesn't already have a token linked
  // (by character_id) in the current scene. Tokens are arranged in a
  // compact row near viewport center, named after the character, and
  // colored from the palette.
  //
  // Skipping already-linked characters makes the button idempotent —
  // clicking again when the party is already on the map does nothing
  // (rather than duplicating everyone).
  //
  // Rationale: DMs running prepared adventures don't want to right-click
  // "add token, rename, rename, rename" 6 times per scene. One click
  // populates the entire party ready to drag into position.
  const addPcTokens = useCallback(() => {
    const vp = vpRef.current;
    if (!vp || !currentScene) return;
    const state = useBattleMapStore.getState();

    // Characters already represented in this scene (by character_id).
    // Filter by sceneId too, since the store may hold tokens from a
    // stale hydration window.
    const existing = new Set(
      Object.values(state.tokens)
        .filter(t => t.sceneId === currentScene.id && t.characterId)
        .map(t => t.characterId as string)
    );

    const toAdd = props.playerCharacters.filter(pc => !existing.has(pc.id));
    if (toAdd.length === 0) {
      showToast('All party characters already have tokens in this scene.', 'info');
      return;
    }

    // Starting point: viewport center snapped. Arrange tokens in a
    // simple row, one cell apart, centered horizontally. For parties
    // bigger than ~5, wraps to a second row.
    const center = vp.center;
    const snapped = snapToCellCenter(center.x, center.y, gridSizePx);
    const perRow = Math.min(5, toAdd.length);
    const rows = Math.ceil(toAdd.length / perRow);
    const startCol = Math.floor(-perRow / 2);
    const startRow = Math.floor(-rows / 2);

    const baseCount = Object.keys(state.tokens).length;
    const newTokens: Token[] = toAdd.map((pc, idx) => {
      const col = idx % perRow;
      const row = Math.floor(idx / perRow);
      const x = snapped.x + (startCol + col) * gridSizePx;
      const y = snapped.y + (startRow + row) * gridSizePx;
      const clampedX = Math.max(gridSizePx / 2, Math.min(WORLD_WIDTH - gridSizePx / 2, x));
      const clampedY = Math.max(gridSizePx / 2, Math.min(WORLD_HEIGHT - gridSizePx / 2, y));
      return {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `token-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        sceneId: currentScene.id,
        x: clampedX,
        y: clampedY,
        size: 'medium',
        rotation: 0,
        name: pc.name,
        color: TOKEN_COLORS[(baseCount + idx) % TOKEN_COLORS.length],
        imageStoragePath: null,
        characterId: pc.id,
        npcId: null,
        // v2.354.0: creatureId added to Token interface; PC tokens
        // never link to a creature row.
        creatureId: null,
        // v2.282: PCs are visible to all from creation. The owning
        // player needs to see their own character; hiding it would
        // be confusing UX. (The other players also see PC tokens —
        // intended behavior, players know who's in the party.)
        visibleToAll: true,
        // v2.412.0 — default LOCKED. PCs are typically immobile until
        // their initiative comes around; the active-turn bypass in
        // pointerdown lets the owning player drag during their own
        // turn while movement remains.
        isLocked: true,
      };
    });

    // Optimistic local inserts first.
    for (const t of newTokens) state.addToken(t);
    // Then fire-and-forget DB inserts. We do them in sequence — the
    // batch is small (party size) and Supabase doesn't have a
    // first-class batch insert via the JS client; mapping to Promise.all
    // is fine but sequential keeps error logs readable.
    (async () => {
      for (const t of newTokens) {
        try { await tokensApi.createToken(t, { campaignId }); }
        catch (err) { console.error('[BattleMapV2] pc token create failed', t.name, err); }
      }
    })();
  }, [props.playerCharacters, currentScene, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT]);

  // v2.355.0 — Legacy NPC roster bulk-add (v2.242) and roster builder
  // (v2.252) are gone. The "+ Add NPCs" toolbar button now opens
  // CreaturePickerModal which sources from the unified NPC tab
  // (creature_folders + homebrew_monsters), and the "Manage Roster"
  // button is removed entirely — creatures are managed in the NPC
  // tab now. The dropped state vars: rosterBuilderOpen,
  // addRosterTokens, and the inlined RosterSelection import.
  const [npcPickerOpen, setNpcPickerOpen] = useState(false);


  // v2.213 "New Scene" — creates an empty scene with default grid,
  // auto-selects it. DM-only via RLS + UI gating.
  // v2.241 — uses inline modal prompt (replaced window.prompt).
  const createNewScene = useCallback(async () => {
    const name = await promptModal({
      title: 'New scene',
      placeholder: 'Scene name',
      defaultValue: `Scene ${scenes.length + 1}`,
      confirmLabel: 'Create',
      allowEmpty: true,
    });
    if (name === null) return; // cancelled
    const scene = await scenesApi.createScene(campaignId, userId, {
      name: name.trim() || `Scene ${scenes.length + 1}`,
    });
    if (!scene) {
      showToast('Failed to create scene. Check console for details.', 'error');
      return;
    }
    setScenes(prev => [...prev, scene]);
    setCurrentScene(scene);
  }, [campaignId, userId, scenes.length, promptModal, showToast]);

  // v2.217 — scene background upload. Separate from portrait uploads:
  // own hidden <input>, own in-flight state, own commit path.
  const mapInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingMap, setUploadingMap] = useState(false);

  // v2.218 — ruler mode toggle. When active, clicking+dragging on the
  // canvas draws a measurement line instead of dragging tokens.
  const [rulerActive, setRulerActive] = useState(false);

  // v2.267.0 — DM-only "Player View" toggle. When on, the DM also
  // sees the fog of war overlay computed from party-shared sight,
  // identical to what players see. Lets the DM verify wall placement
  // without needing a second logged-in client. Default off so the DM
  // sees everything by default; the toggle is a momentary diagnostic.
  // Players never see this control (it's gated by isDM at the
  // toolbar render site).
  const [dmPreviewFog, setDmPreviewFog] = useState(false);

  // v2.223 — wall drawing mode. Mutually exclusive with ruler mode —
  // enabling one disables the other so tool intent is unambiguous.
  const [wallActive, setWallActive] = useState(false);
  // v2.234 — text annotation mode. Three-way mutex with ruler + walls.
  const [textActive, setTextActive] = useState(false);
  // v2.235 — drawing tool mode. Either null (no drawing tool), or one
  // of pencil/line/rect/circle. Mutex with all other tools.
  const [drawActive, setDrawActive] = useState<DrawingKind | null>(null);
  // v2.235 — color + line width for new drawings. Single source for
  // the picker UI; DrawingLayer reads via refs so changes don't
  // re-attach pointer listeners.
  const [drawColor, setDrawColor] = useState('#a78bfa');
  const [drawLineWidth, setDrawLineWidth] = useState(3);
  // v2.236 — FX particle mode. Either null (no FX tool) or one of
  // fire/lightning/sparkles/smoke. Five-way mutex with everything else.
  const [fxActive, setFxActive] = useState<FxKind | null>(null);

  // v2.269.0 — eraser mode. Click on a drawing → delete it. Mutex
  // with every other tool. Held in its own boolean (rather than as a
  // 5th DrawingKind) because:
  //   1. DrawingKind is the persisted shape type — adding an 'eraser'
  //      value would muddle a column that's only ever a real shape.
  //   2. The eraser doesn't paint a preview; its lifecycle is
  //      single-click delete, not drag-to-author. Keeping the state
  //      separate lets DrawingLayer fork the pointer logic cleanly.
  const [eraserActive, setEraserActive] = useState(false);
  // v2.256.0 — particle-density multiplier for FX effects. 1.0 is the
  // legacy v2.236 default; the slider goes 0.25 (subtle) → 2.0 (dense).
  // Persisted in component state only (not localStorage / DB) — the
  // value carries across cast clicks within a session, but resets on
  // refresh. That matches the slider's visual proximity to the FX
  // tools and avoids surprising DMs with a stale density next session.
  const [fxIntensity, setFxIntensity] = useState(1);
  // Imperative trigger handle owned by FxLayer; we set it via ref.
  // Future ships (e.g. enemy attacks) can fire effects through this
  // without going through tool-mode UI.
  const triggerFxRef = useRef<((kind: FxKind, x: number, y: number) => void) | null>(null);
  const toggleRuler = useCallback(() => {
    setRulerActive(a => {
      const next = !a;
      if (next) { setWallActive(false); setTextActive(false); setDrawActive(null); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  const toggleWallMode = useCallback(() => {
    setWallActive(a => {
      const next = !a;
      if (next) { setRulerActive(false); setTextActive(false); setDrawActive(null); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  const toggleTextMode = useCallback(() => {
    setTextActive(a => {
      const next = !a;
      if (next) { setRulerActive(false); setWallActive(false); setDrawActive(null); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  // v2.235 — toggle a specific drawing kind. Clicking the active kind
  // turns it off; clicking a different kind switches to it (still a
  // single-tool active state, just parameterized).
  const toggleDrawMode = useCallback((kind: DrawingKind) => {
    setDrawActive(curr => {
      const next = curr === kind ? null : kind;
      if (next != null) { setRulerActive(false); setWallActive(false); setTextActive(false); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  // v2.236 — toggle a specific FX kind. Same parameterized pattern.
  const toggleFxMode = useCallback((kind: FxKind) => {
    setFxActive(curr => {
      const next = curr === kind ? null : kind;
      if (next != null) { setRulerActive(false); setWallActive(false); setTextActive(false); setDrawActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  // v2.269.0 — eraser toggle. Same mutex pattern.
  const toggleEraserMode = useCallback(() => {
    setEraserActive(a => {
      const next = !a;
      if (next) { setRulerActive(false); setWallActive(false); setTextActive(false); setDrawActive(null); setFxActive(null); }
      return next;
    });
  }, []);

  // v2.356.0 — Clear all drawings on the current scene. One-shot
  // bulk wipe for when the DM has scribbled all over the map and
  // wants a clean slate. Walls, texts, and tokens are NOT touched —
  // only freehand pencil, lines, rects, and circles. Confirms before
  // committing because there's no undo for bulk delete in v2.356.
  const clearAllDrawings = useCallback(async () => {
    if (!currentScene) return;
    // Count locally first so the confirm message is informative.
    const localCount = Object.values(useBattleMapStore.getState().drawings)
      .filter(d => d.sceneId === currentScene.id).length;
    if (localCount === 0) {
      showToast('No drawings to clear on this scene.', 'info');
      return;
    }
    const ok = window.confirm(
      `Delete all ${localCount} drawing${localCount === 1 ? '' : 's'} on this scene? Walls, text, and tokens are not affected.`
    );
    if (!ok) return;
    // Optimistically remove from store so the canvas clears immediately.
    const store = useBattleMapStore.getState();
    const ids = Object.values(store.drawings)
      .filter(d => d.sceneId === currentScene.id)
      .map(d => d.id);
    for (const id of ids) store.removeDrawing(id);
    // Server commit. Returns count or -1 on failure.
    const deleted = await drawingsApi.clearSceneDrawings(currentScene.id);
    if (deleted < 0) {
      showToast('Failed to clear drawings on the server. Refreshing may restore them.', 'error');
      return;
    }
    showToast(`Cleared ${deleted} drawing${deleted === 1 ? '' : 's'}.`, 'success');
  }, [currentScene, showToast]);

  // v2.358.0 — Clear all walls. Companion to clearAllDrawings.
  // User feedback: "The walls that are being drawn and then being
  // erased are still there in affecting the tokens." This happens
  // when per-wall eraser deletes hit RLS errors or network issues —
  // the local store updates optimistically but the DB row stays, so
  // the server-side wall-collision trigger keeps blocking movement.
  // Bulk delete from the DB side guarantees the trigger has nothing
  // to block against.
  const clearAllWalls = useCallback(async () => {
    if (!currentScene) return;
    // Count locally for the confirm message. We may be missing some
    // server-side rows (the bug we're fixing), so the confirm count is
    // a lower bound — we'll report the actual server-side delete count
    // after the fact.
    const localCount = Object.values(useBattleMapStore.getState().walls)
      .filter(w => w.sceneId === currentScene.id).length;
    const msg = localCount === 0
      ? 'Local view shows no walls, but the server may have stale ones blocking movement. Clear them anyway?'
      : `Delete all ${localCount} wall${localCount === 1 ? '' : 's'} on this scene? Drawings, text, and tokens are not affected.`;
    if (!window.confirm(msg)) return;
    // Optimistic local clear so the canvas updates immediately.
    const store = useBattleMapStore.getState();
    const ids = Object.values(store.walls)
      .filter(w => w.sceneId === currentScene.id)
      .map(w => w.id);
    for (const id of ids) store.removeWall(id);
    // Server commit. The bulk delete also catches any stale rows the
    // local store didn't know about (the v2.358 fix's whole point).
    const deleted = await wallsApi.clearSceneWalls(currentScene.id);
    if (deleted < 0) {
      showToast('Failed to clear walls on the server. Movement may still be blocked.', 'error');
      return;
    }
    showToast(`Cleared ${deleted} wall${deleted === 1 ? '' : 's'}.`, 'success');
  }, [currentScene, showToast]);

  // v2.219 — scene settings modal open state.
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Callback invoked by the modal when Save succeeds. Applies the
  // patch optimistically to both local state arrays; the Realtime
  // UPDATE echo will confirm shortly after.
  const applyScenePatch = useCallback((patch: Partial<scenesApi.Scene>) => {
    setScenes(prev => prev.map(s => s.id === currentScene?.id ? { ...s, ...patch } : s));
    setCurrentScene(prev => prev ? { ...prev, ...patch } : prev);
  }, [currentScene?.id]);

  // Callback invoked by the modal after Delete succeeds. Clears
  // currentScene (empty-state screen handles recovery) and removes
  // from list. Realtime DELETE echo will also run but is idempotent.
  const handleSceneDeleted = useCallback((id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
    setCurrentScene(prev => prev && prev.id === id ? null : prev);
  }, []);

  // v2.221 — derive characterId → HP lookup for the HP-bar overlay
  // on PC tokens. Memoized on playerCharacters identity so we don't
  // rebuild every BattleMapV2 render. The map is recreated whenever
  // playerCharacters changes (which happens whenever a character's
  // HP updates, since CampaignDashboard owns the characters state).
  const characterHpMap = useMemo(() => {
    const map = new Map<string, { current: number; max: number }>();
    for (const c of props.playerCharacters) {
      map.set(c.id, { current: c.current_hp, max: c.max_hp });
    }
    return map;
  }, [props.playerCharacters]);

  // v2.244 — npcId → HP lookup, mirror of characterHpMap. CampaignDashboard
  // pre-filters out NPCs without numeric HP, so every entry in props.npcs
  // is a valid bar candidate. Recreated whenever Realtime echoes a
  // damage/heal write, same as characters.
  const npcHpMap = useMemo(() => {
    const map = new Map<string, { current: number; max: number }>();
    for (const n of props.npcs ?? []) {
      map.set(n.id, { current: n.current_hp, max: n.max_hp });
    }
    return map;
  }, [props.npcs]);

  // v2.244 — token.id → conditions[]. Walks the live token store and
  // resolves each token to its linked PC (active_conditions) or NPC
  // (conditions). Keyed by token.id rather than character/npc id so
  // the canvas renderer doesn't have to branch on token kind. The
  // renderer's useEffect already depends on `tokens`, so churn here
  // tracks the same trigger.
  const liveTokens = useBattleMapStore(s => s.tokens);
  const tokenConditionsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const pcConds = new Map<string, string[]>();
    for (const c of props.playerCharacters) pcConds.set(c.id, c.active_conditions ?? []);
    const npcConds = new Map<string, string[]>();
    for (const n of props.npcs ?? []) npcConds.set(n.id, n.conditions ?? []);
    for (const t of Object.values(liveTokens)) {
      // v2.393.0 — prefer per-token combatant conditions when present.
      // Falls through to PC active_conditions for character tokens
      // (those are the canonical store for PCs and stay in sync via
      // the existing characters realtime channel) and template
      // npcConds for legacy creatures without a combatant yet.
      const tokenCombatantConds = props.tokenStateMap?.get(t.id)?.conditions ?? null;
      const conds = tokenCombatantConds
        || (t.characterId && pcConds.get(t.characterId))
        || (t.npcId && npcConds.get(t.npcId))
        || null;
      if (conds && conds.length > 0) map.set(t.id, conds);
    }
    return map;
  }, [liveTokens, props.playerCharacters, props.npcs, props.tokenStateMap]);

  // v2.339.0 — BG3 turn UX. Derive on-map signals for active-turn
  // outline + movement-remaining badge from the combat context.
  //
  // Three derived values:
  //   • activeTokenId — the token belonging to the participant whose
  //     turn it is. Resolved by matching currentActor.entity_id +
  //     participant_type against tokens' characterId / npcId. May be
  //     null if combat isn't running OR if the active actor isn't
  //     placed on this scene's map.
  //   • used — feet of movement spent so far this turn.
  //   • max — effective max for THIS turn (base speed, doubled when
  //     Dash has been consumed; zeroed when the active actor is
  //     unconscious / paralyzed / petrified / stunned). Mirrors the
  //     cheap version of the lib/movement.ts speed gate so the badge
  //     stays honest with what the actor is allowed to spend.
  //
  // TokensLayer reads these via props and stamps a gold pulse + a
  // "Xft / Yft" Text node above the matching token. Cheap to
  // recompute — the heavy lift is upstream in useCombat.
  const { currentActor, encounter } = useCombat();
  const activeTokenInfo = useMemo<{
    tokenId: string | null;
    used: number;
    max: number;
    dashed: boolean;
    participantId: string | null;
    participantName: string | null;
    participantType: 'character' | 'npc' | 'monster' | null;
    encounterId: string | null;
    campaignId: string | null;
    actionUsed: boolean;
    bonusUsed: boolean;
    reactionUsed: boolean;
    participantEntityId: string | null;
  }>(() => {
    const empty = {
      tokenId: null, used: 0, max: 0, dashed: false,
      participantId: null, participantName: null, participantType: null,
      encounterId: null, campaignId: null,
      actionUsed: false, bonusUsed: false, reactionUsed: false,
      participantEntityId: null,
    };
    if (!currentActor) return empty;
    let tokenId: string | null = null;
    for (const t of Object.values(liveTokens)) {
      if (currentActor.participant_type === 'character' && t.characterId === currentActor.entity_id) {
        tokenId = t.id; break;
      }
      if (isCreatureParticipantType(currentActor.participant_type) && t.npcId === currentActor.entity_id) {
        tokenId = t.id; break;
      }
    }
    const baseMax = currentActor.max_speed_ft ?? 30;
    const dashed = currentActor.dash_used_this_turn === true;
    const conds = currentActor.active_conditions ?? [];
    const speedZeroed =
      conds.includes('Unconscious') ||
      conds.includes('Petrified') ||
      conds.includes('Paralyzed') ||
      conds.includes('Stunned');
    const max = speedZeroed ? 0 : (dashed ? baseMax * 2 : baseMax);
    return {
      tokenId,
      used: currentActor.movement_used_ft ?? 0,
      max,
      dashed,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type as 'character' | 'npc' | 'monster',
      encounterId: encounter?.id ?? null,
      campaignId: props.campaignId,
      actionUsed: currentActor.action_used === true,
      bonusUsed: currentActor.bonus_used === true,
      reactionUsed: currentActor.reaction_used === true,
      participantEntityId: (currentActor as any).entity_id ?? null,
    };
  }, [currentActor, liveTokens, encounter, props.campaignId]);

  // v2.346.0 — Click-to-move (BG3 alt input).
  //
  // Drag-to-move (v2.340) is one BG3-style input; click-to-move is
  // the other. Click any empty cell on the map and your active
  // token snaps there, subject to the same movement enforcement +
  // wall checks + logMovement that the drag uses.
  //
  // Activation gates (all must be true):
  //   • Active combat with a current actor
  //   • The active actor's token is on this scene
  //   • The user owns the active actor (their character's token, or
  //     for DMs, any NPC/monster they're running)
  //   • No conflicting tool mode is on (ruler/wall/text/draw/fx/
  //     eraser/directionPick — those modes own canvas clicks)
  //   • The click landed on an EMPTY cell (no token there)
  //   • The click landed on the same scene's grid (within world bounds)
  //
  // The sequence reuses the drag-drop logic verbatim: validate via
  // canMove, snap-back on overspend or wall-block, otherwise commit
  // position and call logMovement to update movement_used_ft +
  // trigger opportunity-attack offers.
  //
  // Tokens already use stopPropagation in their PIXI pointerdown,
  // but PIXI events and DOM events are separate event systems —
  // so a DOM click on the canvas reaches us regardless. We
  // distinguish empty-cell clicks from token clicks by checking
  // if the click cell is occupied; if it is, we abort and let the
  // token's own click handler (open quick panel etc.) do its thing.
  const activeTokenInfoForMoveRef = useRef(activeTokenInfo);
  useEffect(() => { activeTokenInfoForMoveRef.current = activeTokenInfo; }, [activeTokenInfo]);
  // v2.347.0 — generation counter for the in-flight click-to-move
  // animation. Bumped at the start of each move; the rAF loop checks
  // this on every frame and bails if a newer move started. Prevents
  // overlapping animations from fighting over the token's position.
  const clickMoveGenRef = useRef(0);
  // Mirror tool-mode flags into a ref so the click handler reads the
  // current value without re-attaching every time a mode toggles.
  const modeFlagsRef = useRef({
    ruler: rulerActive, wall: wallActive, text: textActive,
    draw: drawActive != null, fx: fxActive != null, eraser: eraserActive,
  });
  useEffect(() => {
    modeFlagsRef.current = {
      ruler: rulerActive, wall: wallActive, text: textActive,
      draw: drawActive != null, fx: fxActive != null, eraser: eraserActive,
    };
  }, [rulerActive, wallActive, textActive, drawActive, fxActive, eraserActive]);

  useEffect(() => {
    if (!canvasEl) return;
    function onClick(e: MouseEvent) {
      const ati = activeTokenInfoForMoveRef.current;
      if (!ati || !ati.tokenId || !ati.participantId) return;
      // Block if any tool mode is on — they own canvas clicks.
      const mf = modeFlagsRef.current;
      if (mf.ruler || mf.wall || mf.text || mf.draw || mf.fx || mf.eraser) return;
      // Block if direction-pick is active (handled by its own listener
      // already, but we're cautious).
      if (useBattleMapStore.getState().directionPick.active) return;
      // Ownership: PC tokens move only when the user owns them.
      // DMs can move any NPC/monster token they control. The
      // myCharacterId prop carries the user's currently-selected PC;
      // isDM is the role flag.
      const isMyCharacter =
        ati.participantType === 'character' &&
        props.myCharacterId &&
        liveTokens[ati.tokenId]?.characterId === props.myCharacterId;
      const isDmRunning =
        props.isDM &&
        isCreatureParticipantType(ati.participantType);
      if (!isMyCharacter && !isDmRunning) return;

      const vp = vpRef.current;
      if (!canvasEl || !vp) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = vp.toWorld(screenX, screenY);

      // Block clicks outside the world bounds (clicks on the grey
      // padding around the map shouldn't trigger movement).
      if (worldPoint.x < 0 || worldPoint.x > WORLD_WIDTH) return;
      if (worldPoint.y < 0 || worldPoint.y > WORLD_HEIGHT) return;

      // Snap target to nearest cell center.
      const snapped = snapToCellCenter(worldPoint.x, worldPoint.y, gridSizePx);
      const targetX = Math.max(0, Math.min(WORLD_WIDTH, snapped.x));
      const targetY = Math.max(0, Math.min(WORLD_HEIGHT, snapped.y));

      // Block if the target cell is occupied by another token (would
      // collide with a creature). Cell-radius check: any token whose
      // snapped position equals our target cell.
      // v2.357.0 — Math.floor (not Math.round); see drawPreview.
      const targetCellRow = Math.floor(targetY / gridSizePx);
      const targetCellCol = Math.floor(targetX / gridSizePx);
      for (const t of Object.values(liveTokens)) {
        if (t.id === ati.tokenId) continue; // skip self
        const tCellRow = Math.floor(t.y / gridSizePx);
        const tCellCol = Math.floor(t.x / gridSizePx);
        if (tCellRow === targetCellRow && tCellCol === targetCellCol) {
          return; // occupied — abort, let token's own click handler win
        }
      }

      // Origin (current token position).
      const myToken = liveTokens[ati.tokenId];
      if (!myToken) return;
      const originX = myToken.x;
      const originY = myToken.y;
      // No-op if the click is on our own current cell.
      if (Math.abs(originX - targetX) < 1 && Math.abs(originY - targetY) < 1) return;

      // v2.348.0 — A* pathfinding (was straight-line wall check).
      // Routes around walls + occupied cells. If no path exists,
      // surface a clean message. The path's cell count drives the
      // movement-budget check (multi-cell paths around walls cost
      // more feet than the straight line would have, and that's
      // RAW-correct).
      // v2.357.0 — Math.floor (not Math.round); see drawPreview.
      const fromCellRow = Math.floor(originY / gridSizePx);
      const fromCellCol = Math.floor(originX / gridSizePx);
      const walls = Object.values(useBattleMapStore.getState().walls);
      const path = findPath(
        { row: fromCellRow, col: fromCellCol },
        { row: targetCellRow, col: targetCellCol },
        {
          widthCells,
          heightCells,
          gridSizePx,
          walls,
          occupants: Object.values(liveTokens),
          moverTokenId: ati.tokenId,
          // Cap A*'s search at the actor's full effective movement
          // (Dash-doubled). Past that, no point searching — the move
          // would fail the canMove gate anyway.
          maxCells: Math.max(1, Math.floor(ati.max / 5)),
        },
      );
      if (!path) {
        showToast("Can't reach there.", 'warn');
        return;
      }
      // Path includes both endpoints. Distance = (cells-1) * 5ft.
      const distanceFt = (path.length - 1) * 5;

      (async () => {
        const check = await canMove(ati.participantId!, distanceFt);
        if (!check.allowed) {
          showToast(
            `Not enough movement (need ${distanceFt}ft, have ${check.remaining}ft).`,
            'warn',
          );
          return;
        }
        // v2.347.0 — Smooth-slide animation (BG3 feel).
        // v2.348.0 — Now walks along the multi-cell path returned by
        // A* instead of one straight-line segment, so the token
        // visibly bends around walls and obstacles.
        //
        // Pre-v2.347 the click-to-move snapped instantly. Now we
        // slide the token along the returned path at ~120 ft/s
        // (250ms per 30ft step). Visual only — server commit + log
        // fire upfront so peers see the move immediately and the
        // movement_used_ft + OA triggers don't lag the animation.
        //
        // Cancellation: a generation counter gates each frame. If
        // another click-to-move starts (or any code calls
        // updateTokenPosition for this token), the token's stored
        // position will diverge from our animated frame's target,
        // so we abort. Belt-and-suspenders against double-clicks
        // and rapid re-aiming.
        //
        // Min duration 60ms (a 5ft step) so even a single-cell
        // step shows visible motion and reads as "deliberate" rather
        // than "snap." Max ~500ms cap so a Dash-doubled 60ft move
        // doesn't drag too long. Cap is total path duration (not per-
        // segment) so a path that bends around walls still finishes
        // in a single human-readable beat.
        const SPEED_PX_PER_MS = (120 * gridSizePx / 5) / 1000; // 120 ft/s in px/ms
        // Convert path cells to world-pixel waypoints. Path[0] is the
        // current cell; we start the slide from path[1].
        const waypoints = path.map(c => ({
          x: (c.col + 0.5) * gridSizePx,
          y: (c.row + 0.5) * gridSizePx,
        }));
        // Total path length in pixels — used for total-duration calc.
        let totalDistPx = 0;
        for (let i = 1; i < waypoints.length; i++) {
          const ddx = waypoints[i].x - waypoints[i - 1].x;
          const ddy = waypoints[i].y - waypoints[i - 1].y;
          totalDistPx += Math.sqrt(ddx * ddx + ddy * ddy);
        }
        const durationMs = Math.max(60, Math.min(500, totalDistPx / SPEED_PX_PER_MS));

        // Fire server commit immediately (peers see the destination).
        // Animation is local-only.
        const commitPromise = tokensApi.updateTokenPos(ati.tokenId!, targetX, targetY);

        // Local rAF animation along the path. Per-frame: compute
        // total elapsed-time-along-path in pixels, then walk the
        // waypoints to find which segment we're in and lerp inside it.
        const startMs = performance.now();
        const tokenId = ati.tokenId!;
        const animateGen = ++clickMoveGenRef.current;
        await new Promise<void>(resolve => {
          function step() {
            if (animateGen !== clickMoveGenRef.current) {
              resolve();
              return;
            }
            const elapsed = performance.now() - startMs;
            const t = Math.min(1, elapsed / durationMs);
            // Distance traveled so far along the path, in pixels.
            const distSoFar = totalDistPx * t;
            let remaining = distSoFar;
            let x = waypoints[0].x;
            let y = waypoints[0].y;
            for (let i = 1; i < waypoints.length; i++) {
              const a = waypoints[i - 1];
              const b = waypoints[i];
              const segDx = b.x - a.x;
              const segDy = b.y - a.y;
              const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
              if (remaining <= segLen || i === waypoints.length - 1) {
                const frac = segLen > 0 ? Math.min(1, remaining / segLen) : 1;
                x = a.x + segDx * frac;
                y = a.y + segDy * frac;
                break;
              }
              remaining -= segLen;
            }
            useBattleMapStore.getState().updateTokenPosition(tokenId, x, y);
            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          }
          requestAnimationFrame(step);
        });

        const result = await commitPromise;
        if (!result.ok) {
          // Roll back on server reject (wall trigger, RLS, etc.).
          useBattleMapStore.getState().updateTokenPosition(ati.tokenId!, originX, originY);
          if (result.reason === 'wall_blocked') {
            showToast('A wall blocks that path.', 'warn');
          } else {
            console.error('[BattleMapV2] click-to-move commit failed', result);
          }
          return;
        }
        if (distanceFt > 0) {
          try {
            await logMovement({
              campaignId: ati.campaignId!,
              encounterId: ati.encounterId,
              participantId: ati.participantId!,
              participantName: ati.participantName!,
              participantType: ati.participantType!,
              fromRow: fromCellRow,
              fromCol: fromCellCol,
              toRow: targetCellRow,
              toCol: targetCellCol,
              distanceFt,
            });
          } catch (err) {
            console.error('[BattleMapV2] click-to-move logMovement threw', err);
          }
        }
      })().catch(err => console.error('[BattleMapV2] click-to-move threw', err));
    }
    canvasEl.addEventListener('click', onClick);
    return () => {
      canvasEl?.removeEventListener('click', onClick);
    };
  }, [canvasEl, liveTokens, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT, props.myCharacterId, props.isDM, showToast]);

  // v2.349.0 — Animated hover path preview for click-to-move.
  //
  // BG3 shows a translucent ghost line from your active token to
  // wherever the cursor is hovering, with the same color-coded
  // cost-vs-budget logic as the drag preview. Click confirms; hover
  // updates live. This is the most polished version of click-to-move
  // feedback — the player sees exactly where they'll end up and what
  // it'll cost BEFORE clicking.
  //
  // Differences from the drag preview (v2.340):
  //   • Activated by hover, not by drag. Hidden when no active turn,
  //     no ownership, mode active, or cursor not over the canvas.
  //   • Uses A* (v2.348) so the preview shows the actual route, not
  //     a straight line. Bends around walls in real time.
  //   • Owned by the parent (this scope), separate from the drag
  //     preview which TokensLayer owns. Both Graphics live on the
  //     viewport but never simultaneously visible (drag is exclusive
  //     while the mouse is held).
  //
  // Throttling: rAF-gated rather than fixed-interval. A fast mouse
  // can fire pointermove 200+ Hz; we only redraw once per animation
  // frame which caps work at ~60 Hz. A* runs in <1ms on typical
  // scenes so the cost is negligible — but redraws aren't, and the
  // visible result is the same.
  const hoverPreviewRefs = useRef<{
    gfx: Graphics | null;
    label: Text | null;
    rafPending: boolean;
    lastClientX: number;
    lastClientY: number;
  }>({
    gfx: null, label: null, rafPending: false,
    lastClientX: 0, lastClientY: 0,
  });
  useEffect(() => {
    if (!canvasEl) return;
    const vp = vpRef.current;
    if (!vp) return;

    // Lazy-mount the preview Graphics + label once. They live in the
    // viewport so they pan/zoom with the world. Both are eventMode:
    // 'none' so they never capture pointer events.
    const gfx = new Graphics();
    gfx.eventMode = 'none';
    gfx.visible = false;
    vp.addChild(gfx);
    const label = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontWeight: '800',
        fontSize: 13,
        fill: 0xfde68a,
        stroke: { color: 0x0a0c10, width: 3 },
        align: 'center',
      }),
    });
    label.anchor.set(0.5, 1);
    label.eventMode = 'none';
    label.visible = false;
    vp.addChild(label);
    hoverPreviewRefs.current.gfx = gfx;
    hoverPreviewRefs.current.label = label;

    function clearPreview() {
      const refs = hoverPreviewRefs.current;
      if (refs.gfx) { refs.gfx.clear(); refs.gfx.visible = false; }
      if (refs.label) refs.label.visible = false;
    }

    function redraw(_clientX: number, _clientY: number) {
      const refs = hoverPreviewRefs.current;
      const gfxLocal = refs.gfx;
      const labelLocal = refs.label;
      if (!gfxLocal || !labelLocal) return;

      // v2.359.0 — Hover-path preview disabled by default. User
      // feedback: the path showing on every mouse move during a
      // turn read as visual noise / "where the character can move
      // by default." The drag-preview path (TokenLayer, fires only
      // during an actual drag) still shows the route + cost while
      // a token is picked up — which is what the user wanted. Click-
      // to-move continues to work via its own handler; users just
      // don't see the planned route until they click.
      clearPreview();
      return;

    }

    function onMove(e: PointerEvent) {
      const refs = hoverPreviewRefs.current;
      refs.lastClientX = e.clientX;
      refs.lastClientY = e.clientY;
      // rAF coalesce: a fast mouse fires pointermove 200+Hz but we
      // only need to redraw once per animation frame. The pending
      // flag ensures we coalesce all moves between two rAF callbacks
      // into a single redraw at the latest cursor position.
      if (refs.rafPending) return;
      refs.rafPending = true;
      requestAnimationFrame(() => {
        refs.rafPending = false;
        redraw(refs.lastClientX, refs.lastClientY);
      });
    }
    function onLeave() { clearPreview(); }
    function onDown() {
      // While drag is starting, the drag preview takes over. Clear
      // ours immediately so the two don't double-render. Drag
      // preview is shown by TokensLayer; we just yield.
      clearPreview();
    }

    canvasEl.addEventListener('pointermove', onMove);
    canvasEl.addEventListener('pointerleave', onLeave);
    canvasEl.addEventListener('pointerdown', onDown);
    return () => {
      if (canvasEl) {
        canvasEl.removeEventListener('pointermove', onMove);
        canvasEl.removeEventListener('pointerleave', onLeave);
        canvasEl.removeEventListener('pointerdown', onDown);
      }
      try {
        if (gfx.parent) gfx.parent.removeChild(gfx);
        if (!gfx.destroyed) gfx.destroy();
        if (label.parent) label.parent.removeChild(label);
        if (!label.destroyed) label.destroy();
      } catch { /* viewport torn down */ }
      hoverPreviewRefs.current.gfx = null;
      hoverPreviewRefs.current.label = null;
    };
  }, [canvasEl, vpRef.current, liveTokens, gridSizePx, widthCells, heightCells, WORLD_WIDTH, WORLD_HEIGHT, props.myCharacterId, props.isDM]);

  // v2.224 — character IDs whose linked tokens should contribute
  // vision polygons. For party-shared sight, every PC in the campaign
  // counts. v2.225 will narrow this to the current user's own
  // characters for proper per-player anti-cheat fog.
  const visionOriginCharacterIds = useMemo(
    () => props.playerCharacters.map(c => c.id),
    [props.playerCharacters],
  );

  const handleRequestMapUpload = useCallback(() => {
    if (!currentScene) return;
    mapInputRef.current?.click();
  }, [currentScene]);

  const handleMapFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-picking the same file re-fires
    if (!file || !currentScene) return;

    if (!assetsApi.ACCEPTED_PORTRAIT_MIME.includes(file.type)) {
      showToast(`Unsupported file type: ${file.type}. Use PNG, JPEG, WebP, or GIF.`, 'warn');
      return;
    }
    if (file.size > assetsApi.MAX_PORTRAIT_BYTES) {
      showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`, 'warn');
      return;
    }

    setUploadingMap(true);
    try {
      const path = await assetsApi.uploadSceneBackground(file, userId, currentScene.id);
      if (!path) {
        showToast('Map upload failed. Check the browser console for details.', 'error');
        return;
      }
      // Optimistic local update — update both the scenes list + currentScene.
      setScenes(prev => prev.map(s => s.id === currentScene.id
        ? { ...s, backgroundStoragePath: path }
        : s));
      setCurrentScene(prev => prev && prev.id === currentScene.id
        ? { ...prev, backgroundStoragePath: path }
        : prev);
      scenesApi.updateScene(currentScene.id, { backgroundStoragePath: path }).catch(err =>
        console.error('[BattleMapV2] scene bg commit failed', err)
      );
    } finally {
      setUploadingMap(false);
    }
  }, [userId, currentScene]);

  const handleRemoveMap = useCallback(async () => {
    if (!currentScene?.backgroundStoragePath) return;
    // v2.241 — was window.confirm.
    const ok = await confirmModal({
      title: 'Remove map image?',
      message: 'The grid will render on a plain background. You can re-upload the image later.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setScenes(prev => prev.map(s => s.id === currentScene.id
      ? { ...s, backgroundStoragePath: null }
      : s));
    setCurrentScene(prev => prev && prev.id === currentScene.id
      ? { ...prev, backgroundStoragePath: null }
      : prev);
    scenesApi.updateScene(currentScene.id, { backgroundStoragePath: null }).catch(err =>
      console.error('[BattleMapV2] scene bg remove commit failed', err)
    );
  }, [currentScene, confirmModal]);

  // v2.274.0 — Set the scene's ambient lighting (bright/dim/dark).
  // Optimistic local update + async DB commit. Realtime echo to other
  // clients is handled by the existing scenes-table channel; the
  // originator's state is already correct from the optimistic update,
  // so the echo is a no-op.
  const handleSetAmbientLight = useCallback((mode: 'bright' | 'dim' | 'dark') => {
    if (!currentScene) return;
    if (currentScene.ambientLight === mode) return; // no-op when already in this mode
    setScenes(prev => prev.map(s => s.id === currentScene.id
      ? { ...s, ambientLight: mode }
      : s));
    setCurrentScene(prev => prev && prev.id === currentScene.id
      ? { ...prev, ambientLight: mode }
      : prev);
    scenesApi.updateScene(currentScene.id, { ambientLight: mode }).catch(err =>
      console.error('[BattleMapV2] ambient light commit failed', err)
    );
  }, [currentScene]);

  const handleContextMenu = useCallback((state: ContextMenuState) => {
    setContextMenu(state);
  }, []);

  // v2.358.0 — Click on a token = JUST SELECT IT. Pre-v2.358 click
  // opened the rich TokenQuickPanel for PCs / NpcTokenQuickPanel for
  // NPCs / TokenContextMenu for unlinked. User feedback: "if we just
  // left click a token it should just select it and shouldn't do
  // anything but if we right click on the token it should give us
  // all the menu system that we currently have." Quick panels are
  // still accessible via the right-click menu's "Open Quick Panel"
  // item — users who want them just take the explicit extra step.
  const handleTokenClick = useCallback((tokenId: string, _screenX: number, _screenY: number) => {
    setSelectedTokenId(tokenId);
    // Close any open quick panels so selection is the only active
    // surface — keeps the canvas clean.
    setClickedToken(null);
    setClickedNpcToken(null);
  }, []);

  // v2.359.0 — wrapper-level contextmenu suppression moved to the JSX
  // onContextMenu prop on the wrapper div (see render below). The
  // previous useEffect was racing with the empty-state early returns.

  // ========================================================
  // Empty-state renderers
  // ========================================================

  // Scenes list loading on first mount — show a neutral placeholder.
  if (scenesLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, padding: 'var(--sp-6, 32px)',
        background: 'var(--c-card)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg, 12px)',
        fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)',
      }}>
        Loading scenes…
      </div>
    );
  }

  // No scenes at all in this campaign yet.
  if (scenes.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
        minHeight: 400, padding: 'var(--sp-8, 48px) var(--sp-4, 16px)',
        background: 'var(--c-card)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg, 12px)',
        textAlign: 'center' as const,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 700,
          color: 'var(--t-1)', marginBottom: 8, letterSpacing: '0.02em',
        }}>
          {isDM ? 'No scenes yet' : 'No scenes published yet'}
        </div>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 12,
          color: 'var(--t-2)', maxWidth: 400, lineHeight: 1.6, marginBottom: 20,
        }}>
          {isDM
            ? 'Create your first scene to start placing tokens. You can add multiple scenes per campaign and switch between them.'
            : 'The DM hasn\u2019t set up a scene for this campaign yet. Check back soon.'}
        </div>
        {isDM && (
          <button
            onClick={createNewScene}
            style={{
              padding: '8px 20px',
              background: 'rgba(167,139,250,0.2)',
              border: '1px solid rgba(167,139,250,0.5)',
              borderRadius: 'var(--r-md, 8px)',
              color: '#a78bfa',
              fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            + Create First Scene
          </button>
        )}
      </div>
    );
  }

  // ========================================================
  // Main render — scene selected (or defaulting to first).
  // ========================================================
  return (
    <div>
      {/* v2.213 scene picker toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', marginBottom: 8,
        background: 'var(--c-raised)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-md, 8px)',
      }}>
        <label style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.06em', color: 'var(--t-3)',
          textTransform: 'uppercase' as const,
        }}>
          Scene
        </label>
        <select
          value={currentScene?.id ?? ''}
          onChange={(e) => {
            const next = scenes.find(s => s.id === e.target.value);
            if (next) setCurrentScene(next);
          }}
          style={{
            padding: '4px 8px',
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            color: 'var(--t-1)',
            fontFamily: 'var(--ff-body)', fontSize: 12,
            minWidth: 200,
          }}
        >
          {scenes.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {isDM && (
          <button
            onClick={createNewScene}
            style={{
              padding: '4px 12px',
              background: 'rgba(167,139,250,0.15)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#a78bfa',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            + New Scene
          </button>
        )}
        {isDM && currentScene && (
          <button
            onClick={() => setSettingsOpen(true)}
            title="Scene settings — rename, resize grid, delete"
            style={{
              padding: '4px 10px',
              background: 'var(--c-card)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm, 4px)',
              color: 'var(--t-2)',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            ⚙ Settings
          </button>
        )}
        {/* v2.281.0 — Fullscreen toggle. Visible to all users (DM and
            players both benefit from a maximized canvas during combat).
            When on, the wrapper goes position:fixed inset:0 and the
            canvas dims compute to viewport size. Esc also exits.
            Active state shown via gold tint to match the existing
            DM toolbar's "active mode" affordance. */}
        <button
          onClick={toggleMapFullscreen}
          title={mapFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map'}
          style={{
            padding: '4px 10px',
            background: mapFullscreen ? 'rgba(212,160,23,0.20)' : 'var(--c-card)',
            border: `1px solid ${mapFullscreen ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
            borderRadius: 'var(--r-sm, 4px)',
            color: mapFullscreen ? 'var(--c-gold-l)' : 'var(--t-2)',
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {mapFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
        </button>
        {loading && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--ff-body)', fontSize: 10,
            color: 'var(--t-3)', fontStyle: 'italic' as const,
          }}>
            Loading tokens…
          </span>
        )}
      </div>

      {/* v2.228 — DM action toolbar. Moved out of the canvas overlay
          (where the buttons sat in semi-transparent cards over the
          map image and were hard to read) into a dedicated solid
          bar that lives above the canvas. The Scene-name badge and
          the zoom/ruler/walls buttons remain on the canvas itself
          since they're contextual to the map. Renders only for the
          DM, and only when there's a current scene to act on. */}
      {isDM && currentScene && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            marginBottom: 8,
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md, 8px)',
            flexWrap: 'wrap' as const,
          }}
        >
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            color: 'var(--t-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginRight: 4,
          }}>
            Map
          </span>
          <button
            onClick={handleRequestMapUpload}
            title={currentScene.backgroundStoragePath
              ? 'Replace the current map image'
              : 'Upload a map image as the scene background'}
            style={{
              padding: '6px 14px',
              background: 'rgba(96,165,250,0.18)',
              border: '1px solid rgba(96,165,250,0.6)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#60a5fa',
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.32)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.18)'; }}
          >
            {currentScene.backgroundStoragePath ? 'Change Map' : 'Upload Map'}
          </button>
          {currentScene.backgroundStoragePath && (
            <button
              onClick={handleRemoveMap}
              title="Remove the current map image"
              style={{
                padding: '6px 14px',
                background: 'rgba(248,113,113,0.18)',
                border: '1px solid rgba(248,113,113,0.55)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#f87171',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.3)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.18)'; }}
            >
              Remove Map
            </button>
          )}
          <span style={{
            width: 1, height: 22,
            background: 'var(--c-border)',
            margin: '0 4px',
          }} />
          {/* v2.274.0 — Lighting controls. Three-state toggle for the
              scene's ambient_light value. Active state is highlighted
              gold; inactive states use a muted variant of the icon
              color so the cluster reads as a connected control group.
              Click the active button = no-op (handler short-circuits).
              Tooltips explain the player-side effect of each mode. */}
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            color: 'var(--t-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginRight: 4,
          }}>
            Light
          </span>
          {([
            { mode: 'bright' as const, icon: '☀', label: 'Bright', tip: 'Daylight / outdoor — players see the entire map (no fog).' },
            { mode: 'dim'    as const, icon: '🌆', label: 'Dim',    tip: 'Dusk / mood — players see a translucent fog over the map; their vision cones cut clear holes.' },
            { mode: 'dark'   as const, icon: '🌑', label: 'Dark',   tip: 'Night / dungeon — players only see inside their vision cones; the rest is opaque black.' },
          ]).map(({ mode, icon, label, tip }) => {
            const active = currentScene.ambientLight === mode;
            return (
              <button
                key={mode}
                onClick={() => handleSetAmbientLight(mode)}
                title={tip}
                style={{
                  padding: '6px 12px',
                  background: active ? 'var(--c-gold-bg)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                  borderRadius: 'var(--r-sm, 4px)',
                  color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
                  fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: active ? 'default' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
          <span style={{
            width: 1, height: 22,
            background: 'var(--c-border)',
            margin: '0 4px',
          }} />
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            color: 'var(--t-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginRight: 4,
          }}>
            Tokens
          </span>
          {props.playerCharacters.length > 0 && (
            <button
              onClick={addPcTokens}
              title="Create a token for each player character that doesn't already have one in this scene"
              style={{
                padding: '6px 14px',
                background: 'rgba(52,211,153,0.18)',
                border: '1px solid rgba(52,211,153,0.6)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#34d399',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.32)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.18)'; }}
            >
              + Add PC Tokens
            </button>
          )}
          {/* v2.242 — DM-only "+ Add NPCs" button. Opens the roster
              picker for bulk NPC token placement from the DM's
              dm_npc_roster. Red-accented to distinguish from the
              green PC button (PC = friendly, NPC = hostile by default). */}
          {isDM && (
            <button
              onClick={() => setNpcPickerOpen(true)}
              title="Add NPCs from your roster"
              style={{
                padding: '6px 14px',
                background: 'rgba(239,68,68,0.18)',
                border: '1px solid rgba(239,68,68,0.55)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#fca5a5',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.32)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; }}
            >
              + Add NPCs
            </button>
          )}
          {/* v2.355.0 — Manage Roster button removed. Creature
              management lives in the NPC tab now (folder browser +
              creature form + catalog import). The legacy
              dm_npc_roster table this button targeted was dropped in
              v2.350. */}
          {/* v2.353.0 — "+ Add Token" button removed. It created
              default placeholder tokens with no creature/character
              linkage, which conflicts with the new unified flow where
              everything on the map should come from the NPC section
              (creatures + folder browser) or be a player's character. */}
        </div>
      )}

      {/* v2.286.0 — Legacy InitiativeBar mount removed. Combat UI
          now lives exclusively in the InitiativeStrip at the bottom
          of the page (mounted by CombatProvider via CampaignDashboard). */}

      <div
        ref={wrapperRef}
        // v2.359.0 — Suppress the browser's native context menu on
        // the entire battle-map wrapper. Pre-v2.359 this was wired
        // via a useEffect with deps=[] that ran once at mount; if
        // the wrapper wasn't rendered yet (scenesLoading state, or
        // empty-scenes empty state), wrapperRef.current was null and
        // the listener never attached. Putting the handler on the
        // JSX makes it a property of the element and applies to any
        // render where the wrapper exists. Token + wall + drawing
        // layers still install their own contextmenu listeners on
        // the canvas for tool-specific delete/menu logic; they
        // preventDefault themselves so they don't fight this one.
        onContextMenu={(e) => e.preventDefault()}
        style={{
          // v2.281.0 — pseudo-fullscreen via position:fixed inset:0.
          // zIndex is below the InitiativeStrip (9999) so combat UI
          // stays on top, but above the app sidebar/header chrome
          // (which sits at standard z-indices ≤100). Border kept on
          // both modes for visual continuity; in fullscreen the
          // border becomes a hairline against the viewport edge.
          ...(mapFullscreen
            ? {
                position: 'fixed' as const,
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9000,
                borderRadius: 0,
              }
            : {
                width: '100%',
                position: 'relative' as const,
              }),
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          ...(mapFullscreen ? {} : { borderRadius: 'var(--r-lg, 12px)' }),
          overflow: 'hidden',
        }}
      >
        {/* v2.281.0 — Floating exit affordance, only when fullscreen.
            The toolbar with the Fullscreen toggle lives ABOVE the
            wrapper and is hidden behind it when fullscreen is on
            (the wrapper covers the viewport). This in-canvas button
            gives users an obvious way out besides Esc. Top-right
            corner; high zIndex to stay above any canvas overlays. */}
        {mapFullscreen && (
          <button
            onClick={toggleMapFullscreen}
            title="Exit fullscreen (Esc)"
            style={{
              position: 'absolute',
              top: 8, right: 8,
              zIndex: 10,
              padding: '6px 12px',
              background: 'rgba(15,16,18,0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid var(--c-gold-bdr)',
              borderRadius: 'var(--r-sm, 4px)',
              color: 'var(--c-gold-l)',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            ⛶ Exit Fullscreen
          </button>
        )}
        <Application
          width={dims.width}
          height={dims.height}
          background={BG_COLOR}
          antialias={true}
        >
          <ViewportHost
            screenWidth={dims.width}
            screenHeight={dims.height}
            worldWidth={WORLD_WIDTH}
            worldHeight={WORLD_HEIGHT}
          >
            {vp => {
              vpRef.current = vp;
              return (
                <>
                  <BackgroundLayer
                    viewport={vp}
                    backgroundPath={currentScene?.backgroundStoragePath ?? null}
                    worldWidth={WORLD_WIDTH}
                    worldHeight={WORLD_HEIGHT}
                  />
                  <GridOverlay
                    viewport={vp}
                    widthCells={widthCells}
                    heightCells={heightCells}
                    gridSizePx={gridSizePx}
                  />
                  {/* v2.223 — walls render above grid but below tokens
                      so tokens overlap walls at their edges (correct
                      depth cue). The drawing tool's rubber-band preview
                      lives on its own Graphics inside WallLayer and
                      also sits in this z-plane. */}
                  <WallLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    active={wallActive}
                    isDM={isDM}
                    gridSizePx={gridSizePx}
                    currentSceneId={currentScene?.id ?? null}
                  />
                  <TokenLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    onContextMenu={handleContextMenu}
                    worldWidth={WORLD_WIDTH}
                    worldHeight={WORLD_HEIGHT}
                    gridSizePx={gridSizePx}
                    currentUserId={userId}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    rulerActive={rulerActive}
                    wallActive={wallActive}
                    textActive={textActive}
                    drawActive={drawActive != null}
                    fxActive={fxActive != null}
                    eraserActive={eraserActive}
                    characterHpMap={characterHpMap}
                    npcHpMap={npcHpMap}
                    tokenStateMap={props.tokenStateMap}
                    tokenConditionsMap={tokenConditionsMap}
                    onTokenClick={handleTokenClick}
                    onMovementBlocked={handleMovementBlocked}
                    isDM={isDM}
                    myCharacterId={props.myCharacterId}
                    activeTokenInfo={activeTokenInfo}
                    recordUndoable={recordUndoable}
                    selectedTokenId={selectedTokenId}
                  />
                  {/* v2.234 — TextLayer renders text annotations and
                      handles the placement/edit/delete interactions
                      when textActive is true. Mounted above tokens
                      so labels read on top of token graphics. */}
                  <TextLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    active={textActive}
                    isDM={isDM}
                    currentSceneId={currentScene?.id ?? null}
                    selectMode={!textActive && drawActive == null && !eraserActive}
                    recordUndoable={recordUndoable}
                  />
                  {/* v2.235 — DrawingLayer renders pencil/line/rect/
                      circle annotations and authors new drawings via
                      pointer drag when activeKind is non-null. Sits
                      above tokens so drawings read on top, but below
                      labels (which are mounted later in this list).
                      Actually mounted AFTER TextLayer here, so labels
                      sit above drawings — DM intent is "drawings as
                      backdrop, labels as captions." */}
                  <DrawingLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    activeKind={drawActive}
                    isDM={isDM}
                    currentSceneId={currentScene?.id ?? null}
                    color={drawColor}
                    lineWidth={drawLineWidth}
                    selectMode={!textActive && drawActive == null && !eraserActive}
                    recordUndoable={recordUndoable}
                    eraserActive={eraserActive}
                    gridSizePx={gridSizePx}
                  />
                  {/* v2.236 — FxLayer renders ephemeral particle
                      effects. Mounted last (top of z-stack) so
                      effects always read above other layers — fire
                      on top of a token feels right. Effects are
                      broadcast over Realtime to all clients viewing
                      this scene; no persistence. */}
                  <FxLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    activeKind={fxActive}
                    campaignId={campaignId}
                    currentSceneId={currentScene?.id ?? null}
                    triggerRef={triggerFxRef}
                    intensity={fxIntensity}
                  />
                  {/* v2.224 — fog of war overlay. DM sees nothing
                      (no fog applied); players see dark over anything
                      outside any party PC token's visibility polygon.
                      Sits above tokens so it can hide them, below the
                      ruler so the ruler is always visible to its user.
                      v2.267.0 — DM can also see fog when dmPreviewFog
                      is on, via the toolbar 👁 Player View toggle. */}
                  <VisionLayer
                    viewport={vp}
                    worldWidth={WORLD_WIDTH}
                    worldHeight={WORLD_HEIGHT}
                    gridSizePx={gridSizePx}
                    isDM={isDM}
                    visionOriginCharacterIds={visionOriginCharacterIds}
                    dmPreviewFog={dmPreviewFog}
                    ambientLight={currentScene?.ambientLight ?? 'dark'}
                  />
                  {/* v2.218 — rendered last so the ruler's Graphics +
                      label appear on top of tokens. Internally addChild's
                      to the viewport when active, so visual z-order
                      follows child order = top of stack. */}
                  <RulerLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    active={rulerActive}
                    gridSizePx={gridSizePx}
                  />
                </>
              );
            }}
          </ViewportHost>
        </Application>

        <div
          style={{
            position: 'absolute', top: 8, left: 12,
            padding: '4px 10px',
            background: 'rgba(15,16,18,0.75)',
            border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: 'var(--r-sm, 4px)',
            fontFamily: 'var(--ff-body)', fontSize: 10,
            fontWeight: 700, letterSpacing: '0.04em',
            color: '#a78bfa', pointerEvents: 'none' as const,
          }}
        >
          {currentScene?.name ?? 'BATTLE MAP v2'} · {widthCells}×{heightCells} · {gridSizePx}PX
        </div>

        {/* v2.228 — DM action toolbar moved out to its own solid bar
            above the canvas (see block above the wrapperRef div). The
            in-canvas position was hard to read against busy maps. */}

        <div
          style={{
            position: 'absolute', bottom: 12, right: 12,
            display: 'flex', gap: 4, flexDirection: 'column' as const,
          }}
        >
          {[
            { label: '+', onClick: zoomIn, title: 'Zoom in' },
            { label: '−', onClick: zoomOut, title: 'Zoom out' },
            { label: '⊡', onClick: zoomFit, title: 'Fit to screen' },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              title={btn.title}
              style={{
                // v2.226 — strong contrast for readability over busy map
                // images. Dark fill + bright text + box-shadow halo so
                // buttons "pop" against any background.
                width: 36, height: 36,
                background: 'rgba(15,16,18,0.95)',
                border: '1px solid rgba(167,139,250,0.65)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#ffffff',
                fontFamily: 'var(--ff-body)', fontSize: 18, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.5)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.35)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.95)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.95)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.65)';
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* v2.233 — Vertical tool palette on the LEFT edge of the canvas
            (Roll20-inspired layout). Replaces the previous bottom-left
            horizontal Ruler/Walls strip. Stacked icon buttons, tooltips
            on hover, color-coded active state. Top "TOOLS" label
            mirrors Roll20's section header. Future ships will slot
            additional tools (Text v2.234, Drawing v2.235, FX v2.236)
            into this same palette without re-layout work.

            Position: top: 60 leaves room for the scene-name badge at
            top: 8, and far enough from the action toolbar bar above
            the canvas that it reads as a tool surface, not a header. */}
        <div
          style={{
            position: 'absolute', top: 60, left: 12,
            display: 'flex', flexDirection: 'column' as const,
            alignItems: 'center', gap: 4,
            padding: '6px 5px',
            background: 'rgba(15,16,18,0.92)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md, 8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 5,
          }}
        >
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase' as const,
            color: 'var(--t-3)',
            padding: '2px 0 4px',
            borderBottom: '1px solid var(--c-border)',
            width: '100%', textAlign: 'center' as const,
            marginBottom: 2,
          }}>
            Tools
          </div>

          {/* Ruler — available to all users (player or DM). */}
          <button
            onClick={toggleRuler}
            title={rulerActive
              ? 'Ruler active — left-click to add segments, right-click or Esc to finish.'
              : 'Ruler — click to drop waypoints; the running total is shown at the cursor.'}
            style={{
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: rulerActive ? 'rgba(251,191,36,0.28)' : 'transparent',
              border: `1px solid ${rulerActive ? 'rgba(251,191,36,0.85)' : 'rgba(251,191,36,0.25)'}`,
              borderRadius: 'var(--r-sm, 4px)',
              color: rulerActive ? '#fbbf24' : 'var(--t-2)',
              fontSize: 18,
              cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!rulerActive) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.55)';
              }
            }}
            onMouseLeave={(e) => {
              if (!rulerActive) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.25)';
              }
            }}
          >
            📏
          </button>

          {/* Walls — DM only. */}
          {isDM && (
            <button
              onClick={toggleWallMode}
              title={wallActive
                ? 'Walls active — click to place vertices, shift+click on a wall cycles solid → closed door → open door, right-click a wall to delete, Esc to cancel current line. Click this button again to exit. Walls/closed doors block sight + movement; open doors block neither.'
                : 'Walls — block line-of-sight + token movement on the map. Shift+click a wall to make it a door (cycles closed/open). Players can\'t see or move past solid walls or closed doors. Toggle 👁 to preview the player\'s view. DM only.'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: wallActive ? 'rgba(167,139,250,0.28)' : 'transparent',
                border: `1px solid ${wallActive ? 'rgba(167,139,250,0.85)' : 'rgba(167,139,250,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: wallActive ? '#a78bfa' : 'var(--t-2)',
                fontSize: 18,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!wallActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!wallActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.25)';
                }
              }}
            >
              🧱
            </button>
          )}

          {/* v2.358.0 — Clear All Walls button. Companion to the
              wall tool. Bulk wipe of every wall on the current scene.
              Critical for unsticking the "walls erased but still
              blocking movement" failure mode where per-wall eraser
              calls didn't reach the DB but the scene_walls table
              still has rows the server-side collision trigger reads. */}
          {isDM && (
            <button
              onClick={clearAllWalls}
              title="Clear all walls on this scene (drawings, text, and tokens are not affected). Use this if walls you erased seem to still be blocking token movement."
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: '1px solid rgba(167,139,250,0.25)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'var(--t-2)',
                fontSize: 14,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.55)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.25)';
              }}
            >
              🧱✕
            </button>
          )}

          {/* v2.267.0 — Player View preview toggle. DM only. When on,
              the DM sees the same fog of war the players see (computed
              from party-shared sight polygons). Used to verify wall +
              token placement without needing a second logged-in client.
              Default off so DMs see the whole map by default. The
              fog overlay only shows up if at least one PC token exists
              on the scene — otherwise there's no vision origin and
              the fog covers the world solid. */}
          {isDM && (
            <button
              onClick={() => setDmPreviewFog(v => !v)}
              title={dmPreviewFog
                ? 'Player View: ON — you are seeing fog as a player would. Click to return to full DM view.'
                : 'Preview Player View — show the same fog of war players see, so you can verify wall placement and PC sight lines.'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: dmPreviewFog ? 'rgba(96,165,250,0.28)' : 'transparent',
                border: `1px solid ${dmPreviewFog ? 'rgba(96,165,250,0.85)' : 'rgba(96,165,250,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: dmPreviewFog ? '#60a5fa' : 'var(--t-2)',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!dmPreviewFog) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!dmPreviewFog) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.25)';
                }
              }}
            >
              👁
            </button>
          )}

          {/* v2.234 — Text annotation tool. DM only. Click on map
              empty space to drop a label; click an existing label to
              edit; right-click an existing label to delete. */}
          {isDM && (
            <button
              onClick={toggleTextMode}
              title={textActive
                ? 'Text active — left-click on the map to place a label, click existing text to edit, right-click to delete. Click this button again to exit.'
                : 'Text — drop labels on the map. DM only.'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: textActive ? 'rgba(96,165,250,0.28)' : 'transparent',
                border: `1px solid ${textActive ? 'rgba(96,165,250,0.85)' : 'rgba(96,165,250,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: textActive ? '#60a5fa' : 'var(--t-2)',
                fontFamily: 'var(--ff-stat)', fontSize: 18, fontWeight: 800,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!textActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!textActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.25)';
                }
              }}
            >
              T
            </button>
          )}

          {/* v2.234+ slot for Text annotation tool will go here. */}
          {/* v2.235 — Drawing tools. DM only. Four kinds in a stack:
              pencil (freehand), line, rect, circle. Each button toggles
              its kind; clicking the active kind exits drawing mode. */}
          {isDM && (() => {
            const drawKinds: Array<{ kind: DrawingKind; icon: string; label: string }> = [
              { kind: 'pencil', icon: '✏️', label: 'Pencil — freehand drawing' },
              { kind: 'line',   icon: '╱',  label: 'Line — straight line segment' },
              { kind: 'rect',   icon: '▭',  label: 'Rectangle' },
              { kind: 'circle', icon: '○',  label: 'Circle' },
            ];
            return (
              <>
                {drawKinds.map(({ kind, icon, label }) => {
                  const active = drawActive === kind;
                  return (
                    <button
                      key={kind}
                      onClick={() => toggleDrawMode(kind)}
                      title={active
                        ? `${label} (active) — click-drag to draw, right-click to delete a drawing. Click this button again to exit.`
                        : label}
                      style={{
                        width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? 'rgba(244,114,182,0.28)' : 'transparent',
                        border: `1px solid ${active ? 'rgba(244,114,182,0.85)' : 'rgba(244,114,182,0.25)'}`,
                        borderRadius: 'var(--r-sm, 4px)',
                        color: active ? '#f472b6' : 'var(--t-2)',
                        fontFamily: 'var(--ff-stat)', fontSize: 16, fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'background 0.12s, border-color 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,114,182,0.14)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.55)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.25)';
                        }
                      }}
                    >
                      {icon}
                    </button>
                  );
                })}
              </>
            );
          })()}

          {/* v2.269.0 — Eraser tool. DM only. Click on a drawing to
              delete it (no confirm — eraser mode is the explicit
              intent). Right-click delete with confirm still works
              outside this mode for the cautious path. Mutex with all
              other tools. Pink palette to match the drawing tools
              (the eraser is a sibling of the draw tools). */}
          {isDM && (
            <button
              onClick={toggleEraserMode}
              title={eraserActive
                ? 'Eraser active — click any drawing to delete it. Click this button again to exit.'
                : 'Eraser — click drawings to remove them. Right-click outside this mode also deletes (with confirm).'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: eraserActive ? 'rgba(244,114,182,0.28)' : 'transparent',
                border: `1px solid ${eraserActive ? 'rgba(244,114,182,0.85)' : 'rgba(244,114,182,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: eraserActive ? '#f472b6' : 'var(--t-2)',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!eraserActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,114,182,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!eraserActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.25)';
                }
              }}
            >
              🧹
            </button>
          )}
          {/* v2.356.0 — Clear All Drawings button. Bulk wipe of every
              pencil/line/rect/circle on the current scene. Confirm
              dialog gates the action since there's no undo. Trash
              icon distinguishes from the eraser (single-click delete);
              same pink palette since both are drawing-tool siblings. */}
          {isDM && (
            <button
              onClick={clearAllDrawings}
              title="Clear all drawings on this scene (walls and text are not affected)"
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: '1px solid rgba(244,114,182,0.25)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'var(--t-2)',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,114,182,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.55)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.25)';
              }}
            >
              🗑
            </button>
          )}
          {/* v2.236 — FX particle effects. DM only. Four kinds:
              fire, lightning, sparkles, smoke. Each spawns a short
              animation at click point and broadcasts to all clients
              via the scene's FX channel. Effects don't persist. */}
          {isDM && (() => {
            const fxKinds: Array<{ kind: FxKind; icon: string; label: string }> = [
              { kind: 'fire',      icon: '🔥', label: 'Fire — orange embers rising' },
              { kind: 'lightning', icon: '⚡', label: 'Lightning — bolt strike with flash' },
              { kind: 'sparkles',  icon: '✨', label: 'Sparkles — gold twinkles fanning out' },
              { kind: 'smoke',     icon: '💨', label: 'Smoke — gray puffs rising' },
            ];
            return (
              <>
                {fxKinds.map(({ kind, icon, label }) => {
                  const active = fxActive === kind;
                  return (
                    <button
                      key={kind}
                      onClick={() => toggleFxMode(kind)}
                      title={active
                        ? `${label} (active) — click on the map to spawn. Click this button again to exit.`
                        : label}
                      style={{
                        width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? 'rgba(34,211,238,0.28)' : 'transparent',
                        border: `1px solid ${active ? 'rgba(34,211,238,0.85)' : 'rgba(34,211,238,0.25)'}`,
                        borderRadius: 'var(--r-sm, 4px)',
                        color: active ? '#22d3ee' : 'var(--t-2)',
                        fontSize: 18,
                        cursor: 'pointer',
                        transition: 'background 0.12s, border-color 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,211,238,0.14)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(34,211,238,0.55)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(34,211,238,0.25)';
                        }
                      }}
                    >
                      {icon}
                    </button>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* v2.235 — Color + line-width picker. Floats next to the
            tool palette only when a drawing tool is active so it
            doesn't crowd the canvas otherwise. Six color swatches +
            three width buttons cover ~95% of typical use without
            needing a full color picker. Future ship can add a
            free-form hex input + a fill toggle. */}
        {isDM && drawActive && (
          <div
            style={{
              position: 'absolute', top: 60, left: 60,
              display: 'flex', flexDirection: 'column' as const,
              alignItems: 'flex-start', gap: 6,
              padding: '8px 10px',
              background: 'rgba(15,16,18,0.92)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-md, 8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 5,
              minWidth: 130,
            }}
          >
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase' as const,
              color: 'var(--t-3)',
            }}>
              Color
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['#a78bfa', '#f87171', '#60a5fa', '#34d399', '#fbbf24', '#ffffff'].map(hex => (
                <button
                  key={hex}
                  onClick={() => setDrawColor(hex)}
                  title={hex}
                  style={{
                    width: 18, height: 18,
                    background: hex,
                    border: drawColor === hex ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              {/* v2.255.0 — freeform hex color. Native <input type="color">
                  acts as the visual picker (DM clicks the swatch, the OS
                  native picker opens). The text input lets DMs paste a
                  specific hex (e.g. from a campaign palette) without
                  going through the picker. Both bind to the same state.
                  Validated to #RGB or #RRGGBB shape before commit so a
                  half-typed string doesn't clobber the active color. */}
              <input
                type="color"
                value={drawColor}
                onChange={(e) => setDrawColor(e.target.value)}
                title="Pick any color"
                style={{
                  width: 22, height: 22,
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: 0,
                  background: 'transparent',
                  marginLeft: 2,
                }}
              />
              <input
                type="text"
                value={drawColor}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  // Permissive while typing; only commit when shape matches.
                  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
                    setDrawColor(v);
                  }
                }}
                placeholder="#hex"
                spellCheck={false}
                style={{
                  width: 70, height: 22,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 4,
                  color: 'var(--t-1)',
                  fontSize: 10, fontFamily: 'monospace',
                  padding: '0 6px',
                  marginLeft: 2,
                }}
              />
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase' as const,
              color: 'var(--t-3)',
              marginTop: 4,
            }}>
              Width
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[2, 4, 8].map(w => (
                <button
                  key={w}
                  onClick={() => setDrawLineWidth(w)}
                  title={`${w}px`}
                  style={{
                    width: 28, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: drawLineWidth === w ? 'rgba(244,114,182,0.28)' : 'transparent',
                    border: `1px solid ${drawLineWidth === w ? 'rgba(244,114,182,0.85)' : 'rgba(255,255,255,0.18)'}`,
                    borderRadius: 'var(--r-sm, 4px)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <div style={{
                    width: 16, height: w, background: drawColor, borderRadius: 1,
                  }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* v2.256.0 — FX intensity slider. Only visible when an FX
            kind is active so it doesn't crowd the toolbar otherwise.
            Same visual idiom as the draw-color popover above. Range
            0.25 (subtle puff) → 2.0 (dense stage effect). The label
            chip shows the current multiplier and a percent so DMs can
            ballpark "twice as many particles" without doing math. */}
        {isDM && fxActive && (
          <div
            style={{
              position: 'absolute', top: 60, left: 60,
              display: 'flex', flexDirection: 'column' as const,
              alignItems: 'flex-start', gap: 6,
              padding: '8px 10px',
              background: 'rgba(15,16,18,0.92)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-md, 8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 5,
              minWidth: 180,
            }}
          >
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase' as const,
              color: 'var(--t-3)',
              display: 'flex', justifyContent: 'space-between' as const, width: '100%',
            }}>
              <span>FX Intensity</span>
              <span style={{ color: '#22d3ee' }}>{Math.round(fxIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={fxIntensity}
              onChange={(e) => setFxIntensity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#22d3ee' }}
            />
            {/* Quick presets — single-click to common values. */}
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              {[
                { v: 0.5, label: 'Subtle' },
                { v: 1.0, label: 'Normal' },
                { v: 1.5, label: 'Dense' },
              ].map(p => (
                <button
                  key={p.v}
                  onClick={() => setFxIntensity(p.v)}
                  style={{
                    flex: 1,
                    padding: '3px 4px',
                    background: Math.abs(fxIntensity - p.v) < 0.05
                      ? 'rgba(34,211,238,0.22)' : 'transparent',
                    border: `1px solid ${Math.abs(fxIntensity - p.v) < 0.05
                      ? 'rgba(34,211,238,0.7)' : 'var(--c-border)'}`,
                    borderRadius: 4,
                    color: Math.abs(fxIntensity - p.v) < 0.05 ? '#22d3ee' : 'var(--t-2)',
                    fontSize: 9, fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            // v2.270.0 — moved to top-right so the floating party
            // panel can occupy the full bottom-left without collision.
            // Top-right is otherwise unused. Reads cleanly above the
            // viewport without competing for attention with the
            // canvas content.
            position: 'absolute', top: 12, right: 12,
            padding: '3px 8px',
            background: 'rgba(15,16,18,0.6)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            fontFamily: 'var(--ff-body)', fontSize: 9,
            color: 'var(--t-3)', pointerEvents: 'none' as const,
            letterSpacing: '0.02em',
            // v2.270.0 — z-index parallel to the party panel (30) so
            // the hint stays above the canvas but below modals.
            zIndex: 30,
            // Cap width so a long hint string doesn't span more than
            // a third of the canvas width — keeps the right edge
            // available for the toolbar overflow / future controls.
            maxWidth: '40%',
            textAlign: 'right' as const,
          }}
        >
          {dmPreviewFog
            ? 'Player View ON — fog shows what players see. Click 👁 again to return to full DM view.'
            : eraserActive
            ? 'Eraser ON — click any drawing to delete it. Click 🧹 again to exit.'
            : wallActive
            ? 'Click to place wall vertices · shift+click a wall = cycle door state · right-click to delete · Esc to cancel · right/middle drag pans · wheel zooms'
            : rulerActive
              ? 'Click to add waypoints · right-click/Esc to finish · right/middle drag pans · wheel zooms'
              : 'Drag tokens · right-click for options · right/middle drag pans · wheel zooms'}
        </div>

        {contextMenu && (
          <TokenContextMenu
            state={contextMenu}
            isDM={isDM}
            onClose={() => setContextMenu(null)}
            onRequestUpload={handleRequestUpload}
            onOpenCharacter={handleOpenCharacter}
            onOpenQuickPanel={(tokenId) => {
              // v2.358.0 — Resolve which panel based on token type.
              // Mirrors the pre-v2.358 handleTokenClick branching but
              // triggered explicitly via the menu instead of on every
              // click. Uses the menu's clientX/Y as the anchor so the
              // panel pops near where the user right-clicked.
              const t = useBattleMapStore.getState().tokens[tokenId];
              if (!t) return;
              if (t.characterId) {
                setClickedNpcToken(null);
                setClickedToken({ tokenId, x: contextMenu.clientX, y: contextMenu.clientY });
              } else if (t.npcId) {
                setClickedToken(null);
                setClickedNpcToken({ npcId: t.npcId, tokenId, x: contextMenu.clientX, y: contextMenu.clientY });
              }
            }}
          />
        )}

        {/* v2.226 — token quick info panel. Opens on left-click
            (without drag) of a character-linked token. Anchored
            near the click point. Backdrop click + Escape close it.
            Re-reads the live character on each render so HP edits
            via the panel reflect immediately (the playerCharacters
            prop is the source of truth and updates via Realtime). */}
        {clickedToken && (() => {
          const t = useBattleMapStore.getState().tokens[clickedToken.tokenId];
          const char = t?.characterId
            ? props.playerCharacters.find(c => c.id === t.characterId)
            : null;
          if (!char) return null;
          return (
            <TokenQuickPanel
              character={char}
              anchorX={clickedToken.x}
              anchorY={clickedToken.y}
              isDM={isDM}
              campaignId={campaignId}
              onClose={() => setClickedToken(null)}
              onOpenSheet={() => {
                setClickedToken(null);
                navigate(`/character/${char.id}`);
              }}
            />
          );
        })()}

        {/* v2.243 — NPC quick panel. Opens when a token with `npcId`
            is clicked. Mutually exclusive with the character panel
            (handleTokenClick clears one when opening the other).
            The panel does its own fetch + Realtime sync against
            the npcs row by id, so we don't need to plumb data here. */}
        {clickedNpcToken && (
          <NpcTokenQuickPanel
            npcId={clickedNpcToken.npcId}
            tokenId={clickedNpcToken.tokenId}
            anchorX={clickedNpcToken.x}
            anchorY={clickedNpcToken.y}
            isDM={isDM}
            onClose={() => setClickedNpcToken(null)}
            /* v2.296.0 — sessionState/onUpdateSession dropped. */
          />
        )}

        {/* v2.219 scene settings modal. Rendered above the canvas via
            position:fixed backdrop so it covers the full viewport, not
            just the map area. */}
        {settingsOpen && currentScene && (
          <SceneSettingsModal
            scene={currentScene}
            onClose={() => setSettingsOpen(false)}
            onScenePatched={applyScenePatch}
            onSceneDeleted={handleSceneDeleted}
          />
        )}

        {/* v2.355.0 — Creature picker. DM-only. Opens on "+ Add NPCs"
            in the Tokens toolbar. Lists every creature the DM has
            created in the NPC tab, organized by folder, with a
            "Place" button per row + bulk "Place Folder" per group.
            Replaces the v2.242 NpcRosterPickerModal which targeted
            the dropped dm_npc_roster table. */}
        {npcPickerOpen && isDM && (
          <CreaturePickerModal
            campaignId={campaignId}
            onClose={() => setNpcPickerOpen(false)}
          />
        )}

        {/* v2.215 hidden file input for portrait uploads. Triggered
            programmatically from the context menu. accept limits the
            native picker; we re-validate in the handler. */}
        <input
          ref={fileInputRef}
          type="file"
          accept={assetsApi.ACCEPTED_PORTRAIT_MIME.join(',')}
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        {/* v2.217 hidden file input for scene background uploads. */}
        <input
          ref={mapInputRef}
          type="file"
          accept={assetsApi.ACCEPTED_PORTRAIT_MIME.join(',')}
          style={{ display: 'none' }}
          onChange={handleMapFileSelected}
        />

        {/* v2.215 upload status banner — appears while uploading. */}
        {uploadingTokenId && (
          <div
            style={{
              position: 'absolute', top: 44, left: 12,
              padding: '4px 10px',
              background: 'rgba(15,16,18,0.85)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              fontFamily: 'var(--ff-body)', fontSize: 10,
              fontWeight: 700, letterSpacing: '0.04em',
              color: '#a78bfa', pointerEvents: 'none' as const,
            }}
          >
            UPLOADING PORTRAIT…
          </div>
        )}

        {/* v2.217 upload status banner for map. */}
        {uploadingMap && (
          <div
            style={{
              position: 'absolute', top: 44, left: 12,
              padding: '4px 10px',
              background: 'rgba(15,16,18,0.85)',
              border: '1px solid rgba(96,165,250,0.5)',
              borderRadius: 'var(--r-sm, 4px)',
              fontFamily: 'var(--ff-body)', fontSize: 10,
              fontWeight: 700, letterSpacing: '0.04em',
              color: '#60a5fa', pointerEvents: 'none' as const,
            }}
          >
            UPLOADING MAP IMAGE…
          </div>
        )}

        {/* v2.270.0 — Party Vitals strip is now a hovering overlay
            inside the canvas wrapper instead of a sibling below it.
            Anchored bottom-left, transparent enough that the canvas
            shows through, and collapsible (state managed inside
            PartyVitalsBar via localStorage). Frees up the vertical
            space the bottom strip used to occupy so the canvas can
            grow taller. */}
        <PartyVitalsBar
          characters={props.playerCharacters}
          onCharacterClick={panToCharacter}
        />

        {/* v2.358.0 — Floating Undo button. User feedback: "There also
            needs to be an undo button if the character moved into a
            incorrect position for the dam it should be in their log
            in the bottom right corner." Anchored bottom-right of the
            map wrapper; visible only when there's something to undo;
            shows the last action label so the DM knows what reverts.
            DM-only (player tokens skip recording per the v2.358 carve-
            out from useUndoRedo's "tokens excluded" rule). */}
        {isDM && canUndo && (
          <button
            onClick={() => { undoLast(); }}
            title="Undo the last action (Ctrl+Z / Cmd+Z)"
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              padding: '8px 14px',
              background: 'rgba(15,16,18,0.92)',
              border: '1px solid rgba(234,179,8,0.55)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#fde68a',
              fontFamily: 'var(--ff-body)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              transition: 'background 0.12s, transform 0.12s',
              zIndex: 50,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(234,179,8,0.18)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.92)';
            }}
          >
            ↶ Undo {lastActionLabel ? lastActionLabel : 'last action'}
          </button>
        )}
      </div>
    </div>
  );
}
