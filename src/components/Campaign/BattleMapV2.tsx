// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell.
// v2.209.0 — Phase Q.1 pt 2: PixiJS Application mounted, first rendered pixels.
// v2.210.0 — Phase Q.1 pt 3: pixi-viewport wired (drag/pinch/wheel/decelerate),
// square grid rendered in world coordinates, snap-to-grid math helpers
// available for v2.211's token drag.
//
// Integration notes for @pixi/react v8 + pixi-viewport v6:
//   The declarative <pixiViewport> JSX approach is viable (per the
//   pixi-react docs) but brittle — the library team itself acknowledges
//   it's "the most common integration issue" (pixijs/pixi-react#590).
//   Imperative instantiation inside a useEffect is more reliable:
//   we reach into the parent Application via useApplication(), build
//   the Viewport with the renderer's events handle, wire plugins, add
//   it as a child of the stage, and return it for child components to
//   render into via a portal-style ref pattern.
//
//   The ViewportHost helper component owns the Viewport lifecycle.
//   Its children are a render-prop that receives the live Viewport
//   instance so the grid + future tokens can addChild into it.
//
// Next up:
//   v2.211 — Zustand store + first draggable token
//   v2.212 — multi-token + size categories + portrait loading
//   v2.213 — DM-only scene create/list UI

import { Application, extend, useApplication } from '@pixi/react';
import { Container, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Register Pixi classes as JSX components (@pixi/react v8 API).
// Called at module scope — extend is idempotent so re-importing is safe.
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

// v2.210 hardcoded scene config — 30x20 cells at 70px = 2100x1400 world px.
// v2.213 will load these from the `scenes` table + DM edit UI.
const SCENE_CONFIG = {
  gridSizePx: 70,
  widthCells: 30,
  heightCells: 20,
} as const;
const WORLD_WIDTH = SCENE_CONFIG.gridSizePx * SCENE_CONFIG.widthCells;
const WORLD_HEIGHT = SCENE_CONFIG.gridSizePx * SCENE_CONFIG.heightCells;

const BG_COLOR = 0x0f1012;
const GRID_MINOR_COLOR = 0x2a2d31; // every cell
const GRID_MAJOR_COLOR = 0x404449; // every 5th cell
const GRID_EDGE_COLOR = 0x6b7280; // world bounds

/**
 * Snap a world-pixel coordinate to the nearest grid cell corner.
 * Exported so v2.211's token-drop handler can reuse the same math.
 */
export function snapToGrid(worldX: number, worldY: number, cellSize = SCENE_CONFIG.gridSizePx) {
  return {
    x: Math.round(worldX / cellSize) * cellSize,
    y: Math.round(worldY / cellSize) * cellSize,
  };
}

/**
 * ViewportHost — mounts pixi-viewport imperatively inside the parent
 * Application. Children are passed a render-prop callback receiving
 * the live Viewport instance, so the grid + tokens can addChild into
 * its world-coordinate space.
 *
 * Imperative ownership avoids the fragile <pixiViewport> JSX approach
 * (see pixijs/pixi-react#590). The useApplication hook only works
 * inside the Application subtree, which is why this component exists
 * as a child of <Application>.
 */
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
  const viewportRef = useRef<Viewport | null>(null);

  useEffect(() => {
    // useApplication returns { app, isInitialized } in v8 — guard both.
    const pixiApp = (app as any)?.app ?? app;
    if (!pixiApp || !pixiApp.renderer) return;

    const vp = new Viewport({
      screenWidth,
      screenHeight,
      worldWidth,
      worldHeight,
      events: pixiApp.renderer.events,
      // passiveWheel:false lets wheel events be preventDefault'd so
      // zooming doesn't also scroll the page. Per pixi-viewport docs
      // this is the standard configuration for embedded canvases.
      passiveWheel: false,
    });

    vp
      .drag({ mouseButtons: 'middle-right' }) // left reserved for token drag later
      .pinch()
      .wheel({ smooth: 8 })
      .decelerate({ friction: 0.92 })
      .clampZoom({ minScale: 0.25, maxScale: 4 })
      .clamp({ direction: 'all', underflow: 'center' });

    // Start centered on the scene.
    vp.moveCenter(worldWidth / 2, worldHeight / 2);
    // Start at a zoom that fits the whole scene into view with a bit
    // of margin. If the scene is bigger than the screen, scale down.
    const fitScale = Math.min(
      screenWidth / worldWidth,
      screenHeight / worldHeight,
    ) * 0.9;
    if (fitScale < 1) vp.setZoom(fitScale, true);

    pixiApp.stage.addChild(vp);
    viewportRef.current = vp;
    setViewport(vp);

    return () => {
      pixiApp.stage.removeChild(vp);
      vp.destroy({ children: true });
      viewportRef.current = null;
      setViewport(null);
    };
    // screen/world size changes → rebuild. Expensive but rare (only
    // on wrapper resize via the outer ResizeObserver). We could
    // update in place via vp.resize() + vp.worldWidth = ..., but
    // rebuild is simpler and keeps plugin state consistent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, screenHeight, worldWidth, worldHeight]);

  return <>{children(viewport)}</>;
}

/**
 * GridOverlay — draws the square grid into a Pixi Graphics object
 * that's added as a child of the provided Viewport. A separate
 * Graphics per major/minor line set would be more efficient with
 * v8 batching, but for a 30x20 grid the single-Graphics approach
 * is plenty fast (fewer than 100 line operations per redraw).
 */
function GridOverlay(props: { viewport: Viewport | null }) {
  const { viewport } = props;
  const graphicsRef = useRef<Graphics | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    viewport.addChild(g);
    graphicsRef.current = g;

    // Outer scene bounds (slightly brighter).
    g.setStrokeStyle({ color: GRID_EDGE_COLOR, width: 2, alpha: 0.8 });
    g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.stroke();

    // Minor grid lines — every cell.
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

    // Major grid lines — every 5th cell (reading anchors for the DM).
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
      if (graphicsRef.current && viewport) {
        viewport.removeChild(graphicsRef.current);
        graphicsRef.current.destroy();
        graphicsRef.current = null;
      }
    };
  }, [viewport]);

  return null;
}

export default function BattleMapV2(_props: BattleMapV2Props) {
  void _props; // unused until v2.212

  // Measure the wrapper so the Pixi canvas matches the surrounding
  // flex layout. Lower-bounded so the renderer never gets 0x0 sizing
  // (which would crash Pixi's WebGL context creation).
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(300, Math.floor(e.contentRect.width));
        // 16:9ish, capped so unbounded flex parents don't blow up.
        const h = Math.min(700, Math.max(400, Math.floor(e.contentRect.width * 0.5625)));
        setDims({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom buttons (fallback for trackpads without pinch, and for
  // accessibility). Operate on the currently-mounted viewport via
  // a ref that the ViewportHost populates.
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
    const fitScale = Math.min(
      dims.width / WORLD_WIDTH,
      dims.height / WORLD_HEIGHT,
    ) * 0.9;
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
            // Side-channel the viewport to the outer component's ref
            // for zoom-button handlers. Runs on every render, cheap.
            vpRef.current = vp;
            return <GridOverlay viewport={vp} />;
          }}
        </ViewportHost>
      </Application>

      {/* Status overlay — top-left. pointerEvents:none so canvas
          keeps input coverage. */}
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

      {/* Zoom controls — bottom-right. Keyboard-accessible fallbacks
          for users who can't pinch-zoom or whose trackpad maps wheel
          to page scroll. */}
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

      {/* Pan/zoom hint — bottom-left, faded. Hide after the user
          interacts (future polish; right now it's always visible). */}
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
        Right/middle drag to pan · wheel to zoom · pinch on trackpad
      </div>
    </div>
  );
}
