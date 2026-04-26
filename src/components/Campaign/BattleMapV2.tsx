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
import { Assets, ColorMatrixFilter, Container, FederatedPointerEvent, Graphics, RenderTexture, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBattleMapStore, type Token, type TokenSize, type Wall, type SceneText, type SceneDrawing, type DrawingKind } from '../../lib/stores/battleMapStore';
import * as scenesApi from '../../lib/api/scenes';
import * as tokensApi from '../../lib/api/sceneTokens';
import * as wallsApi from '../../lib/api/sceneWalls';
import * as textsApi from '../../lib/api/sceneTexts';
import * as drawingsApi from '../../lib/api/sceneDrawings';
import { computeVisibilityPolygon, type WallSegment } from '../../lib/vision/visibilityPolygon';
import { segmentBlockedByWall } from '../../lib/wallCollision';
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
import NpcRosterPickerModal, { type RosterSelection } from './NpcRosterPickerModal';
import NpcRosterBuilderModal from './NpcRosterBuilderModal';
import NpcTokenQuickPanel from './NpcTokenQuickPanel';
import * as npcRosterApi from '../../lib/api/npcRoster';
import * as npcsApi from '../../lib/api/npcs';

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
  // v2.231.0 — Initiative tracker bar at the top of the map needs the
  // session state (initiative_order, current_turn, round, combat_active).
  // The DM bar's "Next Turn" button calls onUpdateSession to advance.
  // Both are optional so the map still renders for older callers that
  // haven't been updated.
  sessionState?: import('../../types').SessionState | null;
  onUpdateSession?: (updates: Partial<import('../../types').SessionState>) => void;
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
  const cellSpan: Record<TokenSize, number> = {
    tiny: 0.4, small: 0.85, medium: 0.85,
    large: 1.85, huge: 2.85, gargantuan: 3.85,
  };
  return (cellSpan[size] * cellSize) / 2;
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
  const col = Math.floor(worldX / cellSize);
  const row = Math.floor(worldY / cellSize);
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
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
    // v2.226 — was 0.9× (which leaves margin around the map). Use 1.0×
    // to fully fill the available canvas; tokens read at usable size.
    const fitScale = Math.min(screenWidth / worldWidth, screenHeight / worldHeight);
    if (fitScale < 1) vp.setZoom(fitScale, true);

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
}) {
  const { viewport, canvasEl, activeKind, isDM, currentSceneId, color, lineWidth, selectMode, recordUndoable, eraserActive } = props;
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

    function findDrawingAt(world: { x: number; y: number }): SceneDrawing | null {
      const c = containerRef.current;
      if (!c) return null;
      // Iterate top-down so the visually-frontmost drawing wins.
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

    function onPointerDown(e: MouseEvent) {
      if (e.button !== 0) return; // primary only
      const w = clientToWorld(e);
      if (!w) return;
      const found = findDrawingAt(w);
      if (!found) {
        // Silent miss — clicking empty space in eraser mode is a no-op.
        // Adding a toast here would spam the user during normal scrub-
        // looking-for-shapes behavior.
        return;
      }
      e.stopPropagation();
      e.preventDefault();
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
    }

    canvasEl.addEventListener('pointerdown', onPointerDown);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
    };
  }, [eraserActive, canvasEl, viewport, isDM, currentSceneId]);

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
}) {
  const {
    viewport, canvasEl, onContextMenu, worldWidth, worldHeight, gridSizePx,
    currentUserId, onDragStart, onDragMove, onDragEnd, rulerActive, wallActive,
    textActive, drawActive, fxActive, eraserActive, characterHpMap, npcHpMap, tokenConditionsMap,
    onTokenClick, onMovementBlocked,
  } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const updatePos = useBattleMapStore(s => s.updateTokenPosition);
  const setDragging = useBattleMapStore(s => s.setDragging);
  const remoteDragLocks = useBattleMapStore(s => s.remoteDragLocks);

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
    // v2.244 — condition icon strip below the name label. One Container
    // owning N child icons (Graphics-backed circle + Text glyph). We
    // tear it down + rebuild on conditions change rather than diff
    // child-by-child; conditions are rare and the cost is trivial.
    conditionsLayer: Container | null;
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
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = (now - start) / 1200;            // 1.2s per cycle
      const phase = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1
      const alpha = 0.55 + phase * 0.45;
      const scale = 1 + phase * 0.08;
      for (const entry of gfxMapRef.current.values()) {
        const ring = entry.lockRing;
        if (!ring || ring.destroyed) continue;
        ring.alpha = alpha;
        ring.scale.set(scale);
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
          conditionsLayer: null,
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
          const oe = event.nativeEvent as PointerEvent;
          clickProbeRef.current = {
            id: tid,
            downClientX: oe.clientX,
            downClientY: oe.clientY,
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
      const npcHpInfo = !pcHpInfo && token.npcId && npcHpMap
        ? npcHpMap.get(token.npcId)
        : null;
      const hpInfo = pcHpInfo ?? npcHpInfo ?? null;
      // NPC bars hide at full HP. PC bars stay always-on (existing v2.221
      // behavior; PCs read their HP bar like a personal status indicator).
      const showHpBar = !!hpInfo && hpInfo.max > 0 && (
        !!pcHpInfo || (npcHpInfo != null && npcHpInfo.current < npcHpInfo.max)
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
        const xR = r * 0.6;
        xMark.clear();
        xMark.setStrokeStyle({ color: 0xef4444, width: 4, alpha: 0.95, cap: 'round' });
        xMark.moveTo(-xR, -xR);
        xMark.lineTo(xR, xR);
        xMark.moveTo(xR, -xR);
        xMark.lineTo(-xR, xR);
        xMark.stroke();
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
    }
  }, [tokens, viewport, setDragging, onContextMenu, gridSizePx, remoteDragLocks, currentUserId, characterHpMap, npcHpMap, tokenConditionsMap]);

  useEffect(() => {
    if (!viewport || !canvasEl) return;

    // v2.216 — throttle drag_move broadcasts to ~20Hz (50ms) so a
    // 60fps pointermove doesn't flood the Realtime channel. Leading-
    // edge: send immediately on the first movement after the window
    // elapses. The final position is covered by onPointerUp below.
    let lastBroadcastMs = 0;

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
        const snapped = snapToCellCenter(t.x, t.y, gridSizePx);
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
          updatePos(drag.id, clampedX, clampedY);
          // v2.216: send one final broadcast at the snapped position so
          // peers see the snap even before the DB round-trip completes.
          onDragMove?.(drag.id, clampedX, clampedY);
          // v2.213 commit — single DB write on release. Only commit if
          // the position actually moved (avoid pointless DB write on click).
          if (!wasClick) {
            // v2.275.0 — also handle the server-side wall trigger
            // rejection. The client-side segmentBlockedByWall check
            // above catches the common case (and gives instant
            // feedback). The server trigger catches the rest:
            //   1. wall added by another client AFTER the drag started
            //      but BEFORE the commit hit the server (race window);
            //   2. malicious / buggy client that skipped the local
            //      check entirely.
            // On rejection, snap the local store back to origin and
            // notify (same UX as client-side rejection). Pre-existing
            // catch() retained for unexpected exceptions (network
            // throws etc.) — the new return shape only resolves with
            // {ok:false} for known supabase errors.
            tokensApi.updateTokenPos(drag.id, clampedX, clampedY).then(result => {
              if (result.ok) return;
              if (result.reason === 'wall_blocked') {
                // Roll back local state to origin. The peer-broadcast
                // we sent above (with the would-be-final position) is
                // self-correcting: peers also see this rollback when
                // we re-broadcast the origin position right below.
                useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
                onDragMove?.(drag.id, drag.originX, drag.originY);
                onMovementBlocked?.();
              } else {
                console.error('[BattleMapV2] pos commit failed', result);
              }
            }).catch(err =>
              console.error('[BattleMapV2] pos commit threw', err)
            );
          }
        }
      }
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
    };
  }, [viewport, canvasEl, updatePos, setDragging, worldWidth, worldHeight, gridSizePx, onDragMove, onDragEnd, onTokenClick, onMovementBlocked]);

  return null;
}

function TokenContextMenu(props: {
  state: ContextMenuState;
  onClose: () => void;
  onRequestUpload: (tokenId: string) => void;
  // v2.222 — when set, the menu shows a "View Character Sheet" item
  // for tokens linked to a character. Caller handles the navigate.
  onOpenCharacter?: (characterId: string) => void;
}) {
  const { state, onClose, onRequestUpload, onOpenCharacter } = props;
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
    return (
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
      </div>
    );
  }

  if (submenu === 'color') {
    return (
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
      </div>
    );
  }

  return (
    <div style={menuBaseStyle} onMouseDown={stop}>
      <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {token.name || 'Token'}
      </div>
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
    </div>
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

/**
 * v2.231.0 — Initiative bar.
 *
 * Slim horizontal strip rendered ABOVE the canvas wrapper inside
 * BattleMapV2 when the campaign's session has combat_active = true.
 * Hidden the rest of the time so it doesn't clutter the map.
 *
 * Shows: Round N · combatant chips left-to-right (initiative order) ·
 * the active combatant has a gold border + scale-up to make it
 * obvious whose turn it is. DMs additionally see a "Next Turn"
 * button that advances current_turn (wrapping to 0 + round++ at
 * the end of the round).
 *
 * Read-only for players. The full initiative editor lives on the
 * Session tab (InitiativeTracker.tsx) and remains the source of
 * truth for adding/removing/rolling combatants.
 *
 * Source of truth: sessionState.initiative_order (Combatant[]) and
 * sessionState.current_turn (index). Both are kept in sync by the
 * existing CampaignDashboard Realtime subscription on campaign_sessions.
 */
function InitiativeBar(props: {
  sessionState: import('../../types').SessionState;
  isDM: boolean;
  onUpdateSession?: (updates: Partial<import('../../types').SessionState>) => void;
}) {
  const { sessionState, isDM, onUpdateSession } = props;
  const order = sessionState.initiative_order ?? [];
  const cur = sessionState.current_turn ?? 0;
  const round = sessionState.round ?? 1;

  if (!sessionState.combat_active || order.length === 0) return null;

  function nextTurn() {
    if (!onUpdateSession || order.length === 0) return;
    const next = cur + 1;
    if (next >= order.length) {
      onUpdateSession({ current_turn: 0, round: round + 1 });
    } else {
      onUpdateSession({ current_turn: next });
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        marginBottom: 8,
        background: 'var(--c-card)',
        border: '1px solid rgba(251,191,36,0.4)',
        borderRadius: 'var(--r-md, 8px)',
        overflowX: 'auto' as const,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        flexShrink: 0,
        padding: '2px 10px',
        background: 'rgba(251,191,36,0.15)',
        border: '1px solid rgba(251,191,36,0.55)',
        borderRadius: 'var(--r-sm, 4px)',
        fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
        letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        color: '#fbbf24',
      }}>
        ⚔ Round {round}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, overflowX: 'auto' as const }}>
        {order.map((c, i) => {
          const active = i === cur;
          const dead = c.current_hp <= 0;
          return (
            <div
              key={c.id}
              title={`${c.name} · Initiative ${c.initiative}${dead ? ' · DOWN' : ''}`}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                minWidth: 64,
                padding: active ? '4px 8px' : '3px 6px',
                background: active
                  ? 'rgba(251,191,36,0.22)'
                  : c.is_monster
                    ? 'rgba(248,113,113,0.1)'
                    : 'rgba(96,165,250,0.1)',
                border: active
                  ? '2px solid #fbbf24'
                  : `1px solid ${c.is_monster ? 'rgba(248,113,113,0.4)' : 'rgba(96,165,250,0.4)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                opacity: dead ? 0.45 : 1,
                transform: active ? 'scale(1.04)' : 'scale(1)',
                transition: 'transform 0.15s, background 0.15s',
              }}
            >
              <div style={{
                fontFamily: 'var(--ff-stat)',
                fontSize: 11, fontWeight: 800,
                color: active ? '#fbbf24' : c.is_monster ? '#f87171' : '#60a5fa',
              }}>
                {c.initiative}
              </div>
              <div style={{
                fontFamily: 'var(--ff-body)',
                fontSize: 10, fontWeight: 700,
                color: 'var(--t-1)',
                maxWidth: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {c.name}
              </div>
              <div style={{
                fontFamily: 'var(--ff-stat)',
                fontSize: 9, fontWeight: 700,
                color: c.current_hp / Math.max(1, c.max_hp) > 0.5
                  ? '#34d399'
                  : c.current_hp / Math.max(1, c.max_hp) > 0.25
                    ? '#fbbf24'
                    : '#f87171',
              }}>
                {c.current_hp}/{c.max_hp}
              </div>
            </div>
          );
        })}
      </div>

      {isDM && onUpdateSession && (
        <button
          onClick={nextTurn}
          title="Advance to the next combatant. Wraps and bumps the round counter at the end of the order."
          style={{
            flexShrink: 0,
            padding: '6px 14px',
            background: 'rgba(251,191,36,0.22)',
            border: '1px solid rgba(251,191,36,0.65)',
            borderRadius: 'var(--r-sm, 4px)',
            color: '#fbbf24',
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          Next Turn →
        </button>
      )}
    </div>
  );
}

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
  const [clickedNpcToken, setClickedNpcToken] = useState<{
    npcId: string;
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
  const { record: recordUndoable } = useUndoRedo(currentScene?.id ?? null);

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
    tokensApi.listTokens(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setTokensBulk(list);
      useBattleMapStore.getState().setLoading(false);
    });
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
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_tokens:${sceneId}`)
      .on(
        // Supabase types lag behind runtime; cast to bypass the literal.
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_tokens',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          // Ignore events for tokens belonging to a different scene —
          // the filter should already handle this but defense-in-depth
          // against filter semantics changing.
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRow = payload.new;
            if (newRow?.scene_id !== sceneId) return;
            store.addToken(dbRowToToken(newRow));
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
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

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
        const targetH = Math.floor(viewportH * 0.86);
        h = Math.max(400, Math.min(targetH, 1400));
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

  // v2.213 "Add Token" commits to DB immediately.
  const addToken = useCallback(() => {
    const vp = vpRef.current;
    if (!vp || !currentScene) return;
    const state = useBattleMapStore.getState();
    const existingCount = Object.keys(state.tokens).length;
    const center = vp.center;
    const snapped = snapToCellCenter(center.x, center.y, gridSizePx);
    const clampedX = Math.max(gridSizePx / 2, Math.min(WORLD_WIDTH - gridSizePx / 2, snapped.x));
    const clampedY = Math.max(gridSizePx / 2, Math.min(WORLD_HEIGHT - gridSizePx / 2, snapped.y));
    const newToken: Token = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sceneId: currentScene.id,
      x: clampedX,
      y: clampedY,
      size: 'medium',
      rotation: 0,
      name: `Token ${existingCount + 1}`,
      color: TOKEN_COLORS[existingCount % TOKEN_COLORS.length],
      imageStoragePath: null,
      characterId: null,
      npcId: null,
    };
    state.addToken(newToken);
    tokensApi.createToken(newToken).catch(err =>
      console.error('[BattleMapV2] token create commit failed', err)
    );
  }, [currentScene, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT]);

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
        try { await tokensApi.createToken(t); }
        catch (err) { console.error('[BattleMapV2] pc token create failed', t.name, err); }
      }
    })();
  }, [props.playerCharacters, currentScene, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT]);

  // v2.242 — Phase Q.1 pt 30: NPC roster bulk-add.
  //
  // The picker modal collects {entry, count} pairs. On confirm we:
  //   1. Determine disambiguating name suffixes per roster entry,
  //      counting existing tokens on this scene with matching base
  //      names so consecutive bulk-adds keep numbering continuous
  //      (Goblin 1..3 from a previous add → next batch starts at 4).
  //   2. Batch-INSERT one row per instance into `npcs` (each gets its
  //      own HP/conditions, in_combat=true, visible_to_players=false).
  //   3. Build N scene_tokens linked via npc_id, arranged in a
  //      compact grid around viewport center, with the roster's
  //      color and emoji-as-name fallback if the entry has no avatar.
  //   4. Optimistic local store inserts, fire-and-forget DB inserts.
  //   5. Bump `times_used` + `last_used_at` on each used roster entry.
  //   6. Toast on success, error if any sub-step failed.
  //
  // Failure handling is pragmatic for v1 — partial commits leave
  // orphans (npcs rows without a matching token). Acceptable because
  // the npcs row itself is harmless (DM can delete from NPCManager).
  const [npcPickerOpen, setNpcPickerOpen] = useState(false);
  // v2.252.0 — roster builder modal. Lifted from v1's BattleMap inline
  // panel so the DM can add/edit/delete entries without flipping to v1
  // and back.
  const [rosterBuilderOpen, setRosterBuilderOpen] = useState(false);
  const addRosterTokens = useCallback(async (selections: RosterSelection[]) => {
    const vp = vpRef.current;
    if (!vp || !currentScene) return;
    if (selections.length === 0) return;

    const state = useBattleMapStore.getState();

    // Compute existing name-base counts on this scene so we can
    // continue numbering from the next free index. We use a loose
    // "starts with name +' '" check to catch "Goblin 1", "Goblin 2"
    // already on the map. Tokens whose name IS exactly the base
    // (e.g., a single un-numbered "Goblin") count too.
    const existingNamesOnScene = Object.values(state.tokens)
      .filter(t => t.sceneId === currentScene.id)
      .map(t => t.name);
    function nextStartIndex(base: string): number {
      let max = 0;
      const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(\\d+))?$`, 'i');
      for (const n of existingNamesOnScene) {
        const m = n.match(re);
        if (m) {
          const num = m[1] ? parseInt(m[1], 10) : 1;
          if (num > max) max = num;
        }
      }
      return max + 1;
    }

    // Count total tokens to add up-front so the grid pattern makes
    // sense across heterogeneous selections (e.g., 3 Goblins + 2 Orcs
    // → 5-token cluster).
    const totalTokens = selections.reduce((sum, s) => sum + s.count, 0);
    const perRow = Math.min(5, totalTokens);
    const rows = Math.ceil(totalTokens / perRow);
    const center = vp.center;
    const snapped = snapToCellCenter(center.x, center.y, gridSizePx);
    const startCol = Math.floor(-perRow / 2);
    const startRow = Math.floor(-rows / 2);

    // Build the npc instance specs first, in iteration order.
    const allSpecs: Array<npcsApi.NpcInstanceSpec & { rosterId: string }> = [];
    for (const sel of selections) {
      const start = nextStartIndex(sel.entry.name);
      for (let i = 0; i < sel.count; i++) {
        const name = `${sel.entry.name} ${start + i}`;
        // Track this name so subsequent selections don't collide.
        existingNamesOnScene.push(name);
        allSpecs.push({
          name,
          roster: sel.entry,
          campaignId,
          rosterId: sel.entry.id,
        });
      }
    }

    // Insert npcs rows in one batch. Result is an array of
    // {id, name} matching the spec order.
    const created = await npcsApi.createNpcInstances(allSpecs);
    if (!created || created.length !== allSpecs.length) {
      showToast('Failed to create NPC instances. Check console for details.', 'error');
      return;
    }

    // Convert hex color string '#ef4444' to 24-bit number 0xef4444
    // for the Token.color field (Pixi expects the numeric form).
    function hexToColor(hex: string | null | undefined): number {
      if (!hex) return 0xef4444;
      const trimmed = hex.replace('#', '').slice(0, 6);
      const n = parseInt(trimmed, 16);
      return Number.isFinite(n) ? n : 0xef4444;
    }

    // Build scene_tokens linked to the new npcs, position grid-clustered.
    const newTokens: Token[] = allSpecs.map((spec, idx) => {
      const npc = created[idx];
      const col = idx % perRow;
      const row = Math.floor(idx / perRow);
      const x = snapped.x + (startCol + col) * gridSizePx;
      const y = snapped.y + (startRow + row) * gridSizePx;
      const clampedX = Math.max(gridSizePx / 2, Math.min(WORLD_WIDTH - gridSizePx / 2, x));
      const clampedY = Math.max(gridSizePx / 2, Math.min(WORLD_HEIGHT - gridSizePx / 2, y));
      // Map roster size string (e.g. 'Medium') to TokenSize literal.
      const sizeRaw = (spec.roster.size ?? 'medium').toLowerCase() as TokenSize;
      const validSizes: TokenSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
      const tokenSize: TokenSize = validSizes.includes(sizeRaw) ? sizeRaw : 'medium';
      return {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `token-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        sceneId: currentScene.id,
        x: clampedX,
        y: clampedY,
        size: tokenSize,
        rotation: 0,
        name: spec.name,
        color: hexToColor(spec.roster.color),
        imageStoragePath: null,
        characterId: null,
        npcId: npc.id,
      };
    });

    // Optimistic local insert + fire-and-forget batch DB insert.
    for (const t of newTokens) state.addToken(t);
    (async () => {
      for (const t of newTokens) {
        try { await tokensApi.createToken(t); }
        catch (err) { console.error('[BattleMapV2] roster token create failed', t.name, err); }
      }
    })();

    // Bump usage on each unique roster entry. Fire-and-forget.
    for (const sel of selections) {
      npcRosterApi.bumpRosterUsage(sel.entry.id, sel.entry.times_used).catch(() => {/* ignore */});
    }

    showToast(`Added ${totalTokens} token${totalTokens === 1 ? '' : 's'} to the scene.`, 'success');
  }, [currentScene, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT, campaignId, showToast]);

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
      const conds = (t.characterId && pcConds.get(t.characterId))
        || (t.npcId && npcConds.get(t.npcId))
        || null;
      if (conds && conds.length > 0) map.set(t.id, conds);
    }
    return map;
  }, [liveTokens, props.playerCharacters, props.npcs]);

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

  // v2.232 — left-click handler. Branches on whether the token is
  // linked to a player character:
  //   - PC linked → rich TokenQuickPanel (HP/AC/conditions/checks/...)
  //   - Unlinked (NPC, plain marker) → fall through to the existing
  //     TokenContextMenu so the user gets SOMETHING (rename / resize /
  //     recolor / upload portrait / delete). Previously did nothing,
  //     which read as "clicking is broken." Right-click still works
  //     for both kinds; left-click is now equivalent for unlinked.
  // Future: when NPC roster ships (v2.234+), unlinked tokens linked
  // to a bestiary entry will get their own quick panel with monster
  // stat block + attack list instead of the bare context menu.
  const handleTokenClick = useCallback((tokenId: string, screenX: number, screenY: number) => {
    const t = useBattleMapStore.getState().tokens[tokenId];
    if (!t) return;
    if (t.characterId) {
      const char = props.playerCharacters.find(c => c.id === t.characterId);
      if (!char) {
        // Token references a character that's no longer in the prop —
        // probably orphaned data. Fall through to context menu so the
        // user can at least delete the orphan.
        setContextMenu({ tokenId, clientX: screenX, clientY: screenY });
        return;
      }
      // v2.243: clear any open NPC panel so panels are mutually exclusive.
      setClickedNpcToken(null);
      setClickedToken({ tokenId, x: screenX, y: screenY });
    } else if (t.npcId) {
      // v2.243 — NPC-linked token (typically from v2.242 roster bulk-add).
      // Opens the NPC quick panel anchored near the click.
      setClickedToken(null);
      setClickedNpcToken({ npcId: t.npcId, x: screenX, y: screenY });
    } else {
      // Truly unlinked token (manual + Add Token, or marker) — open
      // the context menu inline.
      setContextMenu({ tokenId, clientX: screenX, clientY: screenY });
    }
  }, [props.playerCharacters]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => e.preventDefault();
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

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
          {/* v2.252.0 — DM-only "Manage Roster" button. Sits next to
              "+ Add NPCs" because the two are conceptually adjacent
              (build the roster, then place from it). Smaller and more
              subdued visually so it doesn't compete with the primary
              add-to-map action. */}
          {isDM && (
            <button
              onClick={() => setRosterBuilderOpen(true)}
              title="Add, edit, or delete entries in your NPC roster"
              style={{
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'rgba(252,165,165,0.85)',
                fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              Manage Roster
            </button>
          )}
          <button
            onClick={addToken}
            title="Add a token at viewport center"
            style={{
              padding: '6px 14px',
              background: 'rgba(167,139,250,0.22)',
              border: '1px solid rgba(167,139,250,0.6)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#a78bfa',
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.34)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.22)'; }}
          >
            + Add Token
          </button>
        </div>
      )}

      {/* v2.231 — Initiative bar. Renders only when combat is active.
          Shows turn order with active highlight + "Next Turn" for DM. */}
      {props.sessionState && props.sessionState.combat_active && (
        <InitiativeBar
          sessionState={props.sessionState}
          isDM={isDM}
          onUpdateSession={props.onUpdateSession}
        />
      )}

      <div
        ref={wrapperRef}
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
                    tokenConditionsMap={tokenConditionsMap}
                    onTokenClick={handleTokenClick}
                    onMovementBlocked={handleMovementBlocked}
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
            onClose={() => setContextMenu(null)}
            onRequestUpload={handleRequestUpload}
            onOpenCharacter={handleOpenCharacter}
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
            anchorX={clickedNpcToken.x}
            anchorY={clickedNpcToken.y}
            isDM={isDM}
            onClose={() => setClickedNpcToken(null)}
            sessionState={props.sessionState ?? null}
            onUpdateSession={props.onUpdateSession}
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

        {/* v2.242 — NPC roster picker. DM-only. Opens on "+ Add NPCs"
            click in the Tokens toolbar. On confirm, calls
            addRosterTokens which batch-creates npcs rows + scene_tokens. */}
        {npcPickerOpen && isDM && userId && (
          <NpcRosterPickerModal
            ownerId={userId}
            onClose={() => setNpcPickerOpen(false)}
            onConfirm={(selections) => {
              setNpcPickerOpen(false);
              addRosterTokens(selections);
            }}
          />
        )}

        {/* v2.252.0 — NPC roster builder. DM-only. Opens on "Manage
            Roster" click in the Tokens toolbar. List + edit form for
            dm_npc_roster entries. Closes on ✕ or Esc; saves trigger an
            in-modal reload (no parent state to invalidate — the picker
            re-fetches on its own open). */}
        {rosterBuilderOpen && isDM && userId && (
          <NpcRosterBuilderModal
            ownerId={userId}
            campaignId={campaignId}
            onClose={() => setRosterBuilderOpen(false)}
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
      </div>
    </div>
  );
}
