// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell.
// v2.209.0 — Phase Q.1 pt 2: PixiJS Application mounted, first rendered pixels.
// v2.210.0 — Phase Q.1 pt 3: pixi-viewport wired + square grid + snap helper.
// v2.211.0 — Phase Q.1 pt 4: Zustand store for token state + first draggable
// token. One seed token at (350, 350); left-click and drag to move; snaps
// to grid on release. Multiplayer sync deferred to v2.215; this ship is
// pure local state with the same Token shape the multiplayer layer will
// consume.
//
// Drag architecture:
//   The token drag uses `window` pointer events rather than Pixi's
//   event system. Reasons: (1) pointer-out-of-canvas handling is easier
//   with DOM events — Pixi's globalpointermove doesn't fire when the
//   pointer leaves the canvas bounds mid-drag, leading to "stuck token"
//   bugs; (2) coord conversion via `viewport.toWorld(screen)` works
//   against any canvas-relative screen point we compute from
//   event.clientX/Y - canvas.getBoundingClientRect(). The Pixi event
//   fires only the initial `pointerdown` to start the drag.
//
//   Left-mouse is reserved for token drag (not viewport pan — viewport
//   pans on middle/right since v2.210). So there's no conflict between
//   the two drag systems; no plugin pausing needed.

import { Application, extend, useApplication } from '@pixi/react';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBattleMapStore, type Token, type TokenSize } from '../../lib/stores/battleMapStore';

extend({ Container, Graphics });

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

// v2.213 will load scene config from the scenes table.
const SCENE_CONFIG = {
  gridSizePx: 70,
  widthCells: 30,
  heightCells: 20,
} as const;
const WORLD_WIDTH = SCENE_CONFIG.gridSizePx * SCENE_CONFIG.widthCells;
const WORLD_HEIGHT = SCENE_CONFIG.gridSizePx * SCENE_CONFIG.heightCells;

const BG_COLOR = 0x0f1012;
const GRID_MINOR_COLOR = 0x2a2d31;
const GRID_MAJOR_COLOR = 0x404449;
const GRID_EDGE_COLOR = 0x6b7280;

/** v2.213 will reference this from the size category + grid size. */
function tokenRadiusForSize(size: TokenSize, cellSize: number): number {
  // 5e size categories in cells:
  //   tiny = 0.5  (rendered at 0.4 for visual breathing room)
  //   small = 1 (slightly smaller than a cell so the grid shows)
  //   medium = 1
  //   large = 2
  //   huge = 3
  //   gargantuan = 4+
  // We center the token; radius = half cell span × 0.85 to leave a
  // visual gap. For v2.211 we're hardcoding medium.
  const cellSpan: Record<TokenSize, number> = {
    tiny: 0.4, small: 0.85, medium: 0.85,
    large: 1.85, huge: 2.85, gargantuan: 3.85,
  };
  return (cellSpan[size] * cellSize) / 2;
}

/** Snap to the nearest grid cell CENTER (not corner) — tokens render
 *  centered on cells so a move clicks cleanly into the middle of a
 *  square. For a 70px grid, center of cell (2,3) is (2×70+35, 3×70+35).
 *  Exported for v2.215's drop-commit handler. */
export function snapToCellCenter(worldX: number, worldY: number, cellSize = SCENE_CONFIG.gridSizePx) {
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

function GridOverlay(props: { viewport: Viewport | null }) {
  const { viewport } = props;
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    viewport.addChild(g);

    g.setStrokeStyle({ color: GRID_EDGE_COLOR, width: 2, alpha: 0.8 });
    g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.stroke();

    g.setStrokeStyle({ color: GRID_MINOR_COLOR, width: 1, alpha: 0.6 });
    for (let x = 0; x <= SCENE_CONFIG.widthCells; x++) {
      const px = x * SCENE_CONFIG.gridSizePx;
      g.moveTo(px, 0);
      g.lineTo(px, WORLD_HEIGHT);
    }
    for (let y = 0; y <= SCENE_CONFIG.heightCells; y++) {
      const py = y * SCENE_CONFIG.gridSizePx;
      g.moveTo(0, py);
      g.lineTo(WORLD_WIDTH, py);
    }
    g.stroke();

    g.setStrokeStyle({ color: GRID_MAJOR_COLOR, width: 1.5, alpha: 0.9 });
    for (let x = 0; x <= SCENE_CONFIG.widthCells; x += 5) {
      const px = x * SCENE_CONFIG.gridSizePx;
      g.moveTo(px, 0);
      g.lineTo(px, WORLD_HEIGHT);
    }
    for (let y = 0; y <= SCENE_CONFIG.heightCells; y += 5) {
      const py = y * SCENE_CONFIG.gridSizePx;
      g.moveTo(0, py);
      g.lineTo(WORLD_WIDTH, py);
    }
    g.stroke();

    return () => {
      if (viewport && !viewport.destroyed) viewport.removeChild(g);
      g.destroy();
    };
  }, [viewport]);

  return null;
}

/**
 * TokenLayer — imperative Pixi Graphics management for tokens, driven
 * by the Zustand store. Each store token gets a Graphics child of the
 * viewport. When the store changes, we reconcile: create/update/remove.
 *
 * The drag handler attaches to each token's pointerdown via Pixi's
 * event system (to get the initial press with the correct target),
 * then switches to window-level pointermove/pointerup for reliability
 * (Pixi's globalpointermove stops firing when the pointer leaves the
 * canvas bounds — DOM events don't have that limitation).
 */
function TokenLayer(props: { viewport: Viewport | null; canvasEl: HTMLCanvasElement | null }) {
  const { viewport, canvasEl } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const updatePos = useBattleMapStore(s => s.updateTokenPosition);
  const setDragging = useBattleMapStore(s => s.setDragging);

  // Map of token.id → live Graphics instance for reconcile efficiency.
  const tokenGfxRef = useRef<Map<string, Graphics>>(new Map());
  // Active drag state, held in a ref so the pointermove callback sees
  // fresh values without re-binding.
  const dragRef = useRef<{
    id: string;
    offsetX: number; // pointer offset from token center in world coords
    offsetY: number;
  } | null>(null);

  // Container to hold all token Graphics. Separate container so we can
  // cleanly destroy the whole layer on unmount without hunting children.
  const containerRef = useRef<Container | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const c = new Container();
    viewport.addChild(c);
    containerRef.current = c;
    return () => {
      if (viewport && !viewport.destroyed) viewport.removeChild(c);
      c.destroy({ children: true });
      containerRef.current = null;
      tokenGfxRef.current.clear();
    };
  }, [viewport]);

  // Reconcile Graphics with store tokens.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !viewport) return;
    const gfxMap = tokenGfxRef.current;

    // Remove Graphics for tokens that no longer exist in the store.
    for (const [id, g] of gfxMap) {
      if (!tokens[id]) {
        container.removeChild(g);
        g.destroy();
        gfxMap.delete(id);
      }
    }

    // Add/update Graphics for each current token.
    for (const token of Object.values(tokens)) {
      let g = gfxMap.get(token.id);
      const isNew = !g;
      if (isNew) {
        g = new Graphics();
        g.eventMode = 'static';
        g.cursor = 'grab';
        container.addChild(g);
        gfxMap.set(token.id, g);
      }
      const gfx = g!;
      // Position.
      gfx.position.set(token.x, token.y);
      // Redraw (cheap for a circle). For v2.212 sprite path, we'd
      // swap to a Sprite + Texture and avoid per-update redraws.
      gfx.clear();
      const r = tokenRadiusForSize(token.size, SCENE_CONFIG.gridSizePx);
      // Ring (outline) + fill.
      gfx.setFillStyle({ color: token.color, alpha: 0.92 });
      gfx.circle(0, 0, r);
      gfx.fill();
      gfx.setStrokeStyle({ color: 0x0f1012, width: 2, alpha: 0.9 });
      gfx.circle(0, 0, r);
      gfx.stroke();
      gfx.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.35 });
      gfx.circle(0, 0, r - 2);
      gfx.stroke();
      // Hit area — a circle matching the token radius. Pixi defaults
      // the hit area to the rendered bounds but being explicit is
      // cheaper because Graphics bounds scanning can be O(n) across
      // draw calls.
      (gfx as any).hitArea = null; // let Pixi compute from Graphics geometry

      // Event wiring. `removeAllListeners` keeps this idempotent across
      // reconciles (since the closures capture token.id, but the id
      // doesn't change per Graphics instance, just the position — in
      // practice we only need to wire once. Using setData stores id
      // as a Graphics property we can read from the closure.
      if (isNew) {
        (gfx as any).__tokenId = token.id;
        gfx.on('pointerdown', (event: FederatedPointerEvent) => {
          if (!viewport) return;
          // Only primary pointer (left mouse) starts drag. Pixi v8's
          // `button` is 0 = left, 1 = middle, 2 = right.
          if (event.button !== 0) return;
          event.stopPropagation();
          const tid = (gfx as any).__tokenId as string;
          const t = useBattleMapStore.getState().tokens[tid];
          if (!t) return;
          // Convert pointer screen coords to world coords so we can
          // compute the offset from the token's current center. Using
          // toWorld rather than event.getLocalPosition since we want
          // world coords regardless of parent transforms.
          const worldPoint = viewport.toWorld(event.global.x, event.global.y);
          dragRef.current = {
            id: tid,
            offsetX: worldPoint.x - t.x,
            offsetY: worldPoint.y - t.y,
          };
          setDragging(tid);
          gfx.cursor = 'grabbing';
          // Drop shadow-ish feedback: brighten the token while dragged.
          gfx.alpha = 0.75;
        });
      }
    }
  }, [tokens, viewport, setDragging]);

  // Global pointer listeners for the drag. Window-level so out-of-
  // canvas movement still drags, and releasing anywhere commits.
  useEffect(() => {
    if (!viewport || !canvasEl) return;

    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !viewport || !canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = viewport.toWorld(screenX, screenY);
      // Raw position (no snap during drag — snap happens on release).
      updatePos(drag.id, worldPoint.x - drag.offsetX, worldPoint.y - drag.offsetY);
    }

    function onPointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      const t = useBattleMapStore.getState().tokens[drag.id];
      if (t) {
        // Snap to cell center on release.
        const snapped = snapToCellCenter(t.x, t.y);
        // Clamp to world bounds so tokens can't be left off-map.
        const clampedX = Math.max(0, Math.min(WORLD_WIDTH, snapped.x));
        const clampedY = Math.max(0, Math.min(WORLD_HEIGHT, snapped.y));
        updatePos(drag.id, clampedX, clampedY);
      }
      // Restore cursor on the dragged token's graphics.
      const gfx = tokenGfxRef.current.get(drag.id);
      if (gfx) {
        gfx.cursor = 'grab';
        gfx.alpha = 1;
      }
      dragRef.current = null;
      setDragging(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [viewport, canvasEl, updatePos, setDragging]);

  return null;
}

export default function BattleMapV2(_props: BattleMapV2Props) {
  void _props; // unused until v2.212

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  // Track the actual <canvas> element PixiJS mounts so the drag
  // handler can compute pointer-relative-to-canvas coords for toWorld.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

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

  // Find the canvas once the wrapper mounts. Pixi's Application
  // appends a <canvas> as a child of the <pixi-application> DOM node
  // @pixi/react renders. We query for it after first paint.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // poll briefly — Pixi's canvas is appended asynchronously on init
    let attempts = 0;
    const id = setInterval(() => {
      const canvas = el.querySelector('canvas');
      if (canvas) {
        setCanvasEl(canvas as HTMLCanvasElement);
        clearInterval(id);
      } else if (++attempts > 30) {
        // 30 × 50ms = 1.5s cutoff; after that something's wrong.
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [dims.width, dims.height]);

  // Seed a test token the first time the component mounts. v2.213
  // replaces this with scene-hydrated tokens from scene_tokens.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    const state = useBattleMapStore.getState();
    // If tokens already exist (e.g. hot reload) skip.
    if (Object.keys(state.tokens).length === 0) {
      const testToken: Token = {
        id: 'test-token-1',
        sceneId: null,
        x: SCENE_CONFIG.gridSizePx * 5 + SCENE_CONFIG.gridSizePx / 2, // center of cell (5,5)
        y: SCENE_CONFIG.gridSizePx * 5 + SCENE_CONFIG.gridSizePx / 2,
        size: 'medium',
        rotation: 0,
        name: 'Test',
        color: 0xa78bfa, // app purple
      };
      state.addToken(testToken);
    }
    seededRef.current = true;
  }, []);

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
  }, [dims.width, dims.height]);

  return (
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
                <GridOverlay viewport={vp} />
                <TokenLayer viewport={vp} canvasEl={canvasEl} />
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
        BATTLE MAP v2 · {SCENE_CONFIG.widthCells}×{SCENE_CONFIG.heightCells} GRID · {SCENE_CONFIG.gridSizePx}PX
      </div>

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
        Drag tokens with left-click · right/middle drag to pan · wheel to zoom
      </div>
    </div>
  );
}
