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

import { Application, extend, useApplication } from '@pixi/react';
import { Assets, Container, FederatedPointerEvent, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBattleMapStore, type Token, type TokenSize, type Wall } from '../../lib/stores/battleMapStore';
import * as scenesApi from '../../lib/api/scenes';
import * as tokensApi from '../../lib/api/sceneTokens';
import * as wallsApi from '../../lib/api/sceneWalls';
import { dbRowToToken } from '../../lib/api/sceneTokens';
import * as assetsApi from '../../lib/api/battleMapAssets';
import { supabase } from '../../lib/supabase';

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
  const app = useApplication();
  const [viewport, setViewport] = useState<Viewport | null>(null);

  useEffect(() => {
    const pixiApp = (app as any)?.app ?? app;
    if (!pixiApp || !pixiApp.renderer) return;

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
    const fitScale = Math.min(screenWidth / worldWidth, screenHeight / worldHeight) * 0.9;
    if (fitScale < 1) vp.setZoom(fitScale, true);

    pixiApp.stage.addChild(vp);
    setViewport(vp);

    return () => {
      pixiApp.stage.removeChild(vp);
      vp.destroy({ children: true });
      setViewport(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, screenHeight, worldWidth, worldHeight]);

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
  // dragRef holds the WORLD coords of the start cell center while
  // a measurement is in progress.
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

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
    container.visible = false; // hidden until mid-drag
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
      dragRef.current = null;
    };
  }, [viewport, active]);

  // Wire pointer handlers on the canvas element. Active only when
  // ruler mode is on AND we have a viewport + canvas to anchor to.
  useEffect(() => {
    if (!active || !viewport || !canvasEl) return;

    function worldPointFromEvent(e: PointerEvent): { x: number; y: number } | null {
      if (!viewport || !canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      return viewport.toWorld(screenX, screenY);
    }

    function redraw(endX: number, endY: number) {
      const drag = dragRef.current;
      const gfx = graphicsRef.current;
      const label = labelRef.current;
      const container = containerRef.current;
      if (!drag || !gfx || !label || !container) return;

      // Snap endpoint to its cell center for consistent readings.
      const startCell = snapToCellCenter(drag.startX, drag.startY, gridSizePx);
      const endCell = snapToCellCenter(endX, endY, gridSizePx);

      gfx.clear();
      gfx.setStrokeStyle({ color: 0xfbbf24, width: 3, alpha: 0.9 });
      gfx.moveTo(startCell.x, startCell.y);
      gfx.lineTo(endCell.x, endCell.y);
      gfx.stroke();
      // Small end cap dots for visibility.
      gfx.setFillStyle({ color: 0xfbbf24, alpha: 0.95 });
      gfx.circle(startCell.x, startCell.y, 4);
      gfx.circle(endCell.x, endCell.y, 4);
      gfx.fill();

      // Chebyshev distance in cells.
      const dCol = Math.abs(Math.round((endCell.x - startCell.x) / gridSizePx));
      const dRow = Math.abs(Math.round((endCell.y - startCell.y) / gridSizePx));
      const cells = Math.max(dCol, dRow);
      const feet = cells * 5;

      label.text = `${feet} ft · ${cells} ${cells === 1 ? 'cell' : 'cells'}`;
      // Anchor label near the end of the line, biased slightly toward
      // the ruler's midpoint so it doesn't stick off-screen at high
      // zoom.
      label.position.set(endCell.x, endCell.y + gridSizePx * 0.5);

      container.visible = true;
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0) return; // left-mouse only
      // Only intercept events targeting the canvas — if the user
      // clicked a toolbar button, browser focus is elsewhere.
      if (e.target !== canvasEl) return;
      const worldPoint = worldPointFromEvent(e);
      if (!worldPoint) return;
      dragRef.current = { startX: worldPoint.x, startY: worldPoint.y };
      // Seed with a zero-length line so the container appears
      // immediately (feels responsive).
      redraw(worldPoint.x, worldPoint.y);
      // stopPropagation would fight with Pixi's event system — but
      // since ruler mode short-circuits TokenLayer's pointerdown via
      // the active flag, we don't need to here.
    }

    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      const worldPoint = worldPointFromEvent(e);
      if (!worldPoint) return;
      redraw(worldPoint.x, worldPoint.y);
    }

    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      const container = containerRef.current;
      if (container) container.visible = false;
    }

    // pointerdown on the canvas (so clicks on the HTML buttons above
    // don't start a measurement). Move/up on window so drags outside
    // the canvas bounds still track.
    canvasEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      canvasEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
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
    // Style: thin purple lines. When active mode is ON we intensify
    // slightly so the DM gets visual feedback that walls are editable.
    const alpha = active ? 0.95 : 0.85;
    const width = 3;
    gfx.setStrokeStyle({ color: 0xa78bfa, width, alpha });
    for (const w of Object.values(walls)) {
      gfx.moveTo(w.x1, w.y1);
      gfx.lineTo(w.x2, w.y2);
    }
    gfx.stroke();
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
  // v2.221 — character HP lookup for live HP bars on PC tokens.
  // Map<characterId, { current, max }>. Tokens whose characterId
  // matches an entry get an HP bar rendered underneath. Pure data
  // flow — store does not own this; it's derived from the
  // playerCharacters prop on every render.
  characterHpMap?: Map<string, { current: number; max: number }>;
}) {
  const {
    viewport, canvasEl, onContextMenu, worldWidth, worldHeight, gridSizePx,
    currentUserId, onDragStart, onDragMove, onDragEnd, rulerActive, wallActive,
    characterHpMap,
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
  }
  const gfxMapRef = useRef<Map<string, TokenGfx>>(new Map());
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

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

      // v2.221 — HP bar. Only renders when the token is linked to a
      // character we have HP data for. Bar sits below the token at
      // a constant offset; width scales with token radius so Tiny vs
      // Gargantuan both look proportional. Color shifts from green
      // (full) → yellow (50%) → red (25%) for at-a-glance status.
      const hpInfo = token.characterId && characterHpMap
        ? characterHpMap.get(token.characterId)
        : null;
      if (hpInfo && hpInfo.max > 0) {
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
        // Token is no longer linked / character data unavailable —
        // remove the bar.
        if (!currentEntry.hpBar.destroyed) {
          container.removeChild(currentEntry.hpBar);
          currentEntry.hpBar.destroy();
        }
        currentEntry.hpBar = null;
      }
    }
  }, [tokens, viewport, setDragging, onContextMenu, gridSizePx, remoteDragLocks, currentUserId, characterHpMap]);

  useEffect(() => {
    if (!viewport || !canvasEl) return;

    // v2.216 — throttle drag_move broadcasts to ~20Hz (50ms) so a
    // 60fps pointermove doesn't flood the Realtime channel. Leading-
    // edge: send immediately on the first movement after the window
    // elapses. The final position is covered by onPointerUp below.
    let lastBroadcastMs = 0;

    function onPointerMove(e: PointerEvent) {
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

    function onPointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      const t = useBattleMapStore.getState().tokens[drag.id];
      if (t) {
        const snapped = snapToCellCenter(t.x, t.y, gridSizePx);
        const clampedX = Math.max(0, Math.min(worldWidth, snapped.x));
        const clampedY = Math.max(0, Math.min(worldHeight, snapped.y));
        updatePos(drag.id, clampedX, clampedY);
        // v2.216: send one final broadcast at the snapped position so
        // peers see the snap even before the DB round-trip completes.
        onDragMove?.(drag.id, clampedX, clampedY);
        // v2.213 commit — single DB write on release.
        tokensApi.updateTokenPos(drag.id, clampedX, clampedY).catch(err =>
          console.error('[BattleMapV2] pos commit failed', err)
        );
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
      dragRef.current = null;
      setDragging(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [viewport, canvasEl, updatePos, setDragging, worldWidth, worldHeight, gridSizePx, onDragMove, onDragEnd]);

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
        { label: 'Rename…', onClick: () => {
          const next = window.prompt('Token name', token.name);
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
 * "Delete" uses window.confirm for now; v2.220 polish ship will replace
 * the native prompt with a proper inline confirmation pattern.
 */
function SceneSettingsModal(props: {
  scene: scenesApi.Scene;
  onClose: () => void;
  onScenePatched: (patch: Partial<scenesApi.Scene>) => void;
  onSceneDeleted: (id: string) => void;
}) {
  const { scene, onClose, onScenePatched, onSceneDeleted } = props;

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
      alert('Grid size must be between 10 and 500 pixels.');
      return;
    }
    if (!Number.isFinite(widthCells) || widthCells < 1 || widthCells > 200) {
      alert('Width must be between 1 and 200 cells.');
      return;
    }
    if (!Number.isFinite(heightCells) || heightCells < 1 || heightCells > 200) {
      alert('Height must be between 1 and 200 cells.');
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
        alert('Failed to save. Check console for details.');
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!window.confirm(`Delete scene "${scene.name}"? This removes all tokens in it and cannot be undone.`)) return;
    setDeleting(true);
    try {
      const ok = await scenesApi.deleteScene(scene.id);
      if (!ok) {
        alert('Failed to delete. Check console for details.');
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

export default function BattleMapV2(props: BattleMapV2Props) {
  const { isDM, campaignId, userId } = props;

  // v2.222 — navigate to a linked character's full sheet from a token's
  // right-click menu. Uses the same /character/:id route the character
  // creator/lobby use. Memoized to keep TokenContextMenu props stable.
  const navigate = useNavigate();
  const handleOpenCharacter = useCallback((characterId: string) => {
    navigate(`/character/${characterId}`);
  }, [navigate]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
      alert(`Unsupported file type: ${file.type}. Use PNG, JPEG, WebP, or GIF.`);
      return;
    }
    if (file.size > assetsApi.MAX_PORTRAIT_BYTES) {
      alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      return;
    }

    setUploadingTokenId(tokenId);
    try {
      const path = await assetsApi.uploadTokenPortrait(file, userId, tokenId);
      if (!path) {
        alert('Upload failed. Check the browser console for details.');
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

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(300, Math.floor(e.contentRect.width));
        const h = Math.min(700, Math.max(400, Math.floor(e.contentRect.width * 0.5625)));
        setDims({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      alert('All party characters already have tokens in this scene.');
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

  // v2.213 "New Scene" — creates an empty scene with default grid,
  // auto-selects it. DM-only via RLS + UI gating.
  const createNewScene = useCallback(async () => {
    const name = window.prompt('New scene name', `Scene ${scenes.length + 1}`);
    if (name === null) return; // cancelled
    const scene = await scenesApi.createScene(campaignId, userId, {
      name: name.trim() || `Scene ${scenes.length + 1}`,
    });
    if (!scene) {
      alert('Failed to create scene. Check console for details.');
      return;
    }
    setScenes(prev => [...prev, scene]);
    setCurrentScene(scene);
  }, [campaignId, userId, scenes.length]);

  // v2.217 — scene background upload. Separate from portrait uploads:
  // own hidden <input>, own in-flight state, own commit path.
  const mapInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingMap, setUploadingMap] = useState(false);

  // v2.218 — ruler mode toggle. When active, clicking+dragging on the
  // canvas draws a measurement line instead of dragging tokens.
  const [rulerActive, setRulerActive] = useState(false);

  // v2.223 — wall drawing mode. Mutually exclusive with ruler mode —
  // enabling one disables the other so tool intent is unambiguous.
  const [wallActive, setWallActive] = useState(false);
  const toggleRuler = useCallback(() => {
    setRulerActive(a => {
      const next = !a;
      if (next) setWallActive(false);
      return next;
    });
  }, []);
  const toggleWallMode = useCallback(() => {
    setWallActive(a => {
      const next = !a;
      if (next) setRulerActive(false);
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

  const handleRequestMapUpload = useCallback(() => {
    if (!currentScene) return;
    mapInputRef.current?.click();
  }, [currentScene]);

  const handleMapFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-picking the same file re-fires
    if (!file || !currentScene) return;

    if (!assetsApi.ACCEPTED_PORTRAIT_MIME.includes(file.type)) {
      alert(`Unsupported file type: ${file.type}. Use PNG, JPEG, WebP, or GIF.`);
      return;
    }
    if (file.size > assetsApi.MAX_PORTRAIT_BYTES) {
      alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      return;
    }

    setUploadingMap(true);
    try {
      const path = await assetsApi.uploadSceneBackground(file, userId, currentScene.id);
      if (!path) {
        alert('Map upload failed. Check the browser console for details.');
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

  const handleRemoveMap = useCallback(() => {
    if (!currentScene?.backgroundStoragePath) return;
    if (!window.confirm('Remove the current map image? The grid will render on a plain background.')) return;
    setScenes(prev => prev.map(s => s.id === currentScene.id
      ? { ...s, backgroundStoragePath: null }
      : s));
    setCurrentScene(prev => prev && prev.id === currentScene.id
      ? { ...prev, backgroundStoragePath: null }
      : prev);
    scenesApi.updateScene(currentScene.id, { backgroundStoragePath: null }).catch(err =>
      console.error('[BattleMapV2] scene bg remove commit failed', err)
    );
  }, [currentScene]);

  const handleContextMenu = useCallback((state: ContextMenuState) => {
    setContextMenu(state);
  }, []);

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

      <div
        ref={wrapperRef}
        style={{
          width: '100%',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg, 12px)',
          overflow: 'hidden',
          position: 'relative' as const,
        }}
      >
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
                    characterHpMap={characterHpMap}
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

        {isDM && currentScene && (
          <div
            style={{
              position: 'absolute', top: 8, right: 12,
              display: 'flex', gap: 6,
            }}
          >
            <button
              onClick={handleRequestMapUpload}
              title={currentScene.backgroundStoragePath
                ? 'Replace the current map image'
                : 'Upload a map image as the scene background'}
              style={{
                padding: '5px 12px',
                background: 'rgba(96,165,250,0.18)',
                border: '1px solid rgba(96,165,250,0.5)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#60a5fa',
                fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.3)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.18)'; }}
            >
              {currentScene.backgroundStoragePath ? 'Change Map' : 'Upload Map'}
            </button>
            {currentScene.backgroundStoragePath && (
              <button
                onClick={handleRemoveMap}
                title="Remove the current map image"
                style={{
                  padding: '5px 12px',
                  background: 'rgba(248,113,113,0.15)',
                  border: '1px solid rgba(248,113,113,0.4)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: '#f87171',
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.28)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.15)'; }}
              >
                Remove Map
              </button>
            )}
            {/* v2.220 — bulk-add tokens for all player characters that
                don't already have one in this scene. Only renders when
                the DM has party members to add. */}
            {props.playerCharacters.length > 0 && (
              <button
                onClick={addPcTokens}
                title="Create a token for each player character that doesn't already have one in this scene"
                style={{
                  padding: '5px 12px',
                  background: 'rgba(52,211,153,0.18)',
                  border: '1px solid rgba(52,211,153,0.5)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: '#34d399',
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.3)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.18)'; }}
              >
                + Add PC Tokens
              </button>
            )}
            <button
              onClick={addToken}
              title="Add a token at viewport center"
              style={{
                padding: '5px 12px',
                background: 'rgba(167,139,250,0.2)',
                border: '1px solid rgba(167,139,250,0.5)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#a78bfa',
                fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.32)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.2)'; }}
            >
              + Add Token
            </button>
          </div>
        )}

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
                width: 32, height: 32,
                background: 'rgba(15,16,18,0.85)',
                border: '1px solid rgba(167,139,250,0.35)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#a78bfa',
                fontFamily: 'var(--ff-body)', fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* v2.218 — tools toolbar (available to all users). Positioned
            just above the hint text at bottom-left so it's easy to
            reach without visually crowding the DM toolbar on the right. */}
        <div
          style={{
            position: 'absolute', bottom: 40, left: 12,
            display: 'flex', gap: 4,
          }}
        >
          <button
            onClick={toggleRuler}
            title={rulerActive ? 'Click-drag on the map to measure · click again to exit ruler' : 'Enter ruler mode — click-drag on the map to measure distance'}
            style={{
              padding: '4px 10px',
              background: rulerActive ? 'rgba(251,191,36,0.25)' : 'rgba(15,16,18,0.85)',
              border: `1px solid ${rulerActive ? 'rgba(251,191,36,0.7)' : 'rgba(251,191,36,0.35)'}`,
              borderRadius: 'var(--r-sm, 4px)',
              color: rulerActive ? '#fbbf24' : 'var(--t-2)',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={(e) => {
              if (!rulerActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.12)';
            }}
            onMouseLeave={(e) => {
              if (!rulerActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.85)';
            }}
          >
            📏 {rulerActive ? 'Exit Ruler' : 'Ruler'}
          </button>
          {/* v2.223 — wall drawing tool. DM-only (insert/delete RLS
              would reject players anyway). Click-click vertex placement;
              Escape cancels pending start. Right-click deletes nearest
              wall within a small hit threshold. */}
          {isDM && (
            <button
              onClick={toggleWallMode}
              title={wallActive
                ? 'Click to place wall vertices · right-click to delete · Esc to cancel · click again to exit'
                : 'Enter wall drawing mode — click to place vertices, build walls that (in v2.224) will block vision'}
              style={{
                padding: '4px 10px',
                background: wallActive ? 'rgba(167,139,250,0.28)' : 'rgba(15,16,18,0.85)',
                border: `1px solid ${wallActive ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.35)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: wallActive ? '#a78bfa' : 'var(--t-2)',
                fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => {
                if (!wallActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)';
              }}
              onMouseLeave={(e) => {
                if (!wallActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.85)';
              }}
            >
              🧱 {wallActive ? 'Exit Walls' : 'Walls'}
            </button>
          )}
        </div>

        <div
          style={{
            position: 'absolute', bottom: 12, left: 12,
            padding: '3px 8px',
            background: 'rgba(15,16,18,0.6)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            fontFamily: 'var(--ff-body)', fontSize: 9,
            color: 'var(--t-3)', pointerEvents: 'none' as const,
            letterSpacing: '0.02em',
          }}
        >
          {wallActive
            ? 'Click to place wall vertices · right-click to delete · Esc to cancel · right/middle drag pans · wheel zooms'
            : rulerActive
              ? 'Click-drag to measure · right/middle drag pans · wheel zooms'
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
      </div>
    </div>
  );
}
