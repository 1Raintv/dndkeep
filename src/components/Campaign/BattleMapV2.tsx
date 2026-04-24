// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell.
// v2.209.0 — Phase Q.1 pt 2: PixiJS Application mounted, first rendered pixels.
// v2.210.0 — Phase Q.1 pt 3: pixi-viewport wired + square grid + snap helper.
// v2.211.0 — Phase Q.1 pt 4: Zustand store + first draggable token.
// v2.212.0 — Phase Q.1 pt 5: multi-token support + token initials (centered
// text on each circle so they're distinguishable at a glance) + DM-only
// "Add Token" button + right-click context menu (Rename / Resize / Recolor
// / Delete).
//
// Architecture shift from v2.211:
//   Tokens are now a Container-per-token (not a single Graphics). The
//   container holds a Graphics child (the circle) and a Text child (the
//   initials). Event handlers attach to the container so clicks on either
//   shape or text both register. Container position IS the token position;
//   children render at 0,0 relative (so resizing updates the Graphics
//   radius without touching child-positioning math).
//
// Context menu:
//   HTML DOM menu absolute-positioned via client coords, NOT a Pixi
//   overlay. Reasons: (a) text inputs and submenus are trivial in HTML
//   and painful in Pixi; (b) browser context menus are native UX; (c) the
//   menu persists above the canvas without z-index fights with Pixi's
//   own render tree. Right-click on a token fires pointerdown with
//   button=2 → we preventDefault on the parent wrapper's contextmenu,
//   stopPropagation on the Pixi event (so viewport doesn't pan), and
//   open the menu at (clientX, clientY).
//
// DM gating:
//   "Add Token" button only renders when props.isDM === true. Context
//   menu is available to anyone who can hit the token — v2.215's RLS
//   filtering means players only see tokens they can interact with.
//   For this local-only ship, everyone sees everything.
//
// Next up:
//   v2.213 — Supabase Storage bucket + portrait upload + sprite texture
//            rendering (replaces the Graphics circle with a Sprite)
//   v2.214 — scene create/list UI, hydrate tokens from scene_tokens table
//   v2.215 — multiplayer sync via Supabase Realtime

import { Application, extend, useApplication } from '@pixi/react';
import { Container, FederatedPointerEvent, Graphics, Text, TextStyle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBattleMapStore, type Token, type TokenSize } from '../../lib/stores/battleMapStore';

extend({ Container, Graphics, Text });

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

// v2.212 — token color palette. Cycled through on each "Add Token".
// Chosen for contrast against the dark bg and clear differentiation
// at a glance during combat. Add more when 6 isn't enough for a big
// encounter.
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

/** Radius in world pixels for a token of the given size, based on
 *  5e cell-span occupancy. Medium tokens render slightly smaller than
 *  a full cell so the grid line is still visible. */
function tokenRadiusForSize(size: TokenSize, cellSize: number): number {
  const cellSpan: Record<TokenSize, number> = {
    tiny: 0.4, small: 0.85, medium: 0.85,
    large: 1.85, huge: 2.85, gargantuan: 3.85,
  };
  return (cellSpan[size] * cellSize) / 2;
}

/** Generate initials from a token name — max 2 chars. "Goblin 1" →
 *  "G1", "Ancient Red Dragon" → "AR", "Kobold" → "K". Falls back to
 *  "?" when name is empty (shouldn't happen via UI but defensive). */
function tokenInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Prefer acronym: first letter of each word, capped at 2.
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Single-word: first letter + trailing digit if any (e.g. "T1" for "Token1").
  const match = trimmed.match(/^([A-Za-z])([^A-Za-z]*\d)?/);
  if (match) {
    const firstChar = match[1].toUpperCase();
    const digitGroup = (match[2] ?? '').replace(/\D/g, '');
    if (digitGroup) return (firstChar + digitGroup[0]).slice(0, 2);
    return firstChar;
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/** Snap to the nearest grid cell center. Exported for v2.215's
 *  drop-commit handler. */
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

interface ContextMenuState {
  tokenId: string;
  clientX: number;
  clientY: number;
}

function TokenLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  onContextMenu: (state: ContextMenuState) => void;
}) {
  const { viewport, canvasEl, onContextMenu } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const updatePos = useBattleMapStore(s => s.updateTokenPosition);
  const setDragging = useBattleMapStore(s => s.setDragging);

  // Each token gets a Container (parent) that holds a Graphics (circle)
  // + Text (initials). We track the whole container for pointer events
  // and both children for targeted updates.
  interface TokenGfx {
    container: Container;
    circle: Graphics;
    initials: Text;
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

  // Reconcile Pixi display tree with the store.
  useEffect(() => {
    const layer = layerContainerRef.current;
    if (!layer || !viewport) return;
    const gfxMap = gfxMapRef.current;

    // Remove display tree for tokens no longer in the store.
    for (const [id, entry] of gfxMap) {
      if (!tokens[id]) {
        layer.removeChild(entry.container);
        entry.container.destroy({ children: true });
        gfxMap.delete(id);
      }
    }

    // Add or update each store token.
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
        entry = { container, circle, initials };
        gfxMap.set(token.id, entry);

        (container as any).__tokenId = token.id;
        container.on('pointerdown', (event: FederatedPointerEvent) => {
          if (!viewport) return;
          // Right-click (button 2) opens the context menu, doesn't drag.
          if (event.button === 2) {
            event.stopPropagation();
            event.preventDefault();
            const tid = (container as any).__tokenId as string;
            // Use the originalEvent's clientX/Y — Pixi's global is
            // canvas-relative, but we want viewport-relative for the
            // DOM menu positioned via position:fixed.
            const oe = event.nativeEvent as MouseEvent | PointerEvent;
            onContextMenu({
              tokenId: tid,
              clientX: oe.clientX,
              clientY: oe.clientY,
            });
            return;
          }
          // Only primary button (left) starts drag.
          if (event.button !== 0) return;
          event.stopPropagation();
          const tid = (container as any).__tokenId as string;
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
        });
      }
      const { container, circle, initials } = entry!;

      // Position.
      container.position.set(token.x, token.y);

      // Redraw circle if size or color changed. For perf we could
      // compare against cached last-draw values, but circle redraw
      // is cheap (<0.1ms) and the reconcile is only per-render-cycle
      // when tokens object identity changes.
      const r = tokenRadiusForSize(token.size, SCENE_CONFIG.gridSizePx);
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

      // Initials text — update label + size. Scale font to ~50% of
      // token radius so Tiny (14px radius) reads "T" and Gargantuan
      // (135px) reads proportionally big.
      const newText = tokenInitials(token.name);
      if (initials.text !== newText) initials.text = newText;
      const targetFontSize = Math.max(11, Math.round(r * 0.75));
      if (initials.style.fontSize !== targetFontSize) {
        initials.style.fontSize = targetFontSize;
      }
    }
  }, [tokens, viewport, setDragging, onContextMenu]);

  // Window-level drag handlers — identical to v2.211.
  useEffect(() => {
    if (!viewport || !canvasEl) return;

    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !viewport || !canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = viewport.toWorld(screenX, screenY);
      updatePos(drag.id, worldPoint.x - drag.offsetX, worldPoint.y - drag.offsetY);
    }

    function onPointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      const t = useBattleMapStore.getState().tokens[drag.id];
      if (t) {
        const snapped = snapToCellCenter(t.x, t.y);
        const clampedX = Math.max(0, Math.min(WORLD_WIDTH, snapped.x));
        const clampedY = Math.max(0, Math.min(WORLD_HEIGHT, snapped.y));
        updatePos(drag.id, clampedX, clampedY);
      }
      const entry = gfxMapRef.current.get(drag.id);
      if (entry) {
        entry.container.cursor = 'grab';
        entry.container.alpha = 1;
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

/** The right-click context menu, rendered as a DOM overlay
 *  position:fixed at the click point. Closes on any outside click
 *  or Escape. Three actions (rename/resize/recolor/delete) — v2.214
 *  can upgrade Rename to a proper inline input modal; for now the
 *  native prompt() suffices. */
function TokenContextMenu(props: {
  state: ContextMenuState;
  onClose: () => void;
}) {
  const { state, onClose } = props;
  const token = useBattleMapStore(s => s.tokens[state.tokenId]);
  const removeToken = useBattleMapStore(s => s.removeToken);
  const [submenu, setSubmenu] = useState<'none' | 'size' | 'color'>('none');

  // Close on outside click.
  useEffect(() => {
    function handler(_e: MouseEvent) {
      onClose();
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Defer attach to next tick so the opening right-click doesn't
    // immediately close the menu (its own mousedown bubbles up).
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

  // Guard: token may have been deleted from another path.
  if (!token) return null;

  function updateToken(patch: Partial<Token>) {
    const current = useBattleMapStore.getState().tokens[state.tokenId];
    if (!current) return;
    useBattleMapStore.setState(s => ({
      tokens: { ...s.tokens, [state.tokenId]: { ...current, ...patch } },
    }));
  }

  // Menu positioning — clamp to viewport so menus near the edge
  // don't overflow off-screen. Approximate width 180px, height 200px.
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

  // Swallow mousedown inside the menu so the outside-click handler
  // doesn't fire for clicks on menu items. The onClick still works.
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
            onClick={() => { updateToken({ size: sz }); onClose(); }}
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
              onClick={() => { updateToken({ color: c }); onClose(); }}
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
      {[
        { label: 'Rename…', onClick: () => {
          // v2.214 will replace prompt() with a proper inline input.
          const next = window.prompt('Token name', token.name);
          if (next !== null) {
            updateToken({ name: next.trim() || token.name });
          }
          onClose();
        }},
        { label: 'Resize ▸', onClick: () => setSubmenu('size') },
        { label: 'Recolor ▸', onClick: () => setSubmenu('color') },
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
          removeToken(state.tokenId);
          onClose();
        }}
      >
        Delete
      </div>
    </div>
  );
}

export default function BattleMapV2(props: BattleMapV2Props) {
  const { isDM } = props;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
  }, [dims.width, dims.height]);

  // Seed a test token on first mount (same as v2.211).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    const state = useBattleMapStore.getState();
    if (Object.keys(state.tokens).length === 0) {
      const testToken: Token = {
        id: 'test-token-1',
        sceneId: null,
        x: SCENE_CONFIG.gridSizePx * 5 + SCENE_CONFIG.gridSizePx / 2,
        y: SCENE_CONFIG.gridSizePx * 5 + SCENE_CONFIG.gridSizePx / 2,
        size: 'medium',
        rotation: 0,
        name: 'Test',
        color: 0xa78bfa,
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

  // v2.212 — "Add Token" button, DM-only. Places the new token at the
  // current viewport center (which is the DM's current focus) so they
  // don't have to hunt for it after pressing the button. Cycles
  // through TOKEN_COLORS by current token count.
  const addToken = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const state = useBattleMapStore.getState();
    const existingCount = Object.keys(state.tokens).length;
    const center = vp.center;
    const snapped = snapToCellCenter(center.x, center.y);
    // Clamp so it can't land outside the world.
    const clampedX = Math.max(SCENE_CONFIG.gridSizePx / 2, Math.min(WORLD_WIDTH - SCENE_CONFIG.gridSizePx / 2, snapped.x));
    const clampedY = Math.max(SCENE_CONFIG.gridSizePx / 2, Math.min(WORLD_HEIGHT - SCENE_CONFIG.gridSizePx / 2, snapped.y));
    const newToken: Token = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sceneId: null,
      x: clampedX,
      y: clampedY,
      size: 'medium',
      rotation: 0,
      name: `Token ${existingCount + 1}`,
      color: TOKEN_COLORS[existingCount % TOKEN_COLORS.length],
    };
    state.addToken(newToken);
  }, []);

  const handleContextMenu = useCallback((state: ContextMenuState) => {
    setContextMenu(state);
  }, []);

  // Prevent browser's native right-click menu inside the wrapper —
  // we have our own. Attached on the wrapper so zoom buttons etc.
  // also suppress it.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => e.preventDefault();
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

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
                <TokenLayer
                  viewport={vp}
                  canvasEl={canvasEl}
                  onContextMenu={handleContextMenu}
                />
              </>
            );
          }}
        </ViewportHost>
      </Application>

      {/* Status banner — top-left */}
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

      {/* DM toolbar — top-right */}
      {isDM && (
        <div
          style={{
            position: 'absolute', top: 8, right: 12,
            display: 'flex', gap: 6,
          }}
        >
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

      {/* Zoom buttons — bottom-right */}
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

      {/* Usage hint — bottom-left */}
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
        Drag tokens · right-click for options · right/middle drag pans · wheel zooms
      </div>

      {/* Context menu overlay */}
      {contextMenu && (
        <TokenContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
