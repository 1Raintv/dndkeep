// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell (placeholder).
// v2.209.0 — Phase Q.1 pt 2: PixiJS Application mounted, first rendered
// pixels — a colored background + centered grid stamp proving the
// renderer works. This is the scaffold every subsequent ship builds on.
//
// Next up:
//   v2.210 — pixi-viewport for pan/zoom + full square grid overlay + snap math
//   v2.211 — first draggable token, Zustand state store
//   v2.212 — multi-token, size categories, portrait loading from Storage
//   v2.213 — DM-only scene creation / management UI
//
// @pixi/react v8 API notes (for future maintainers):
//   - `Application` is imported from @pixi/react — not Stage (that was v7)
//   - `extend({ Container, Graphics, ... })` must be called once at module
//     scope BEFORE using JSX elements. This is how v8 keeps bundle size
//     small — only explicitly extended classes become JSX components.
//   - JSX elements are prefixed: <pixiContainer>, <pixiGraphics>, etc.
//   - Draw callbacks for Graphics go through the `draw` prop: a function
//     that receives the Graphics instance and should call clear() first.

import { Application, extend } from '@pixi/react';
import { Container, Graphics } from 'pixi.js';
import { useCallback, useEffect, useRef, useState } from 'react';

// Register the Pixi classes we use as JSX components. Called once at
// module scope — @pixi/react's extend is idempotent so re-importing
// this file from other entry points is safe.
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

// v2.209 hardcoded scene config. v2.213 will load these from the
// `scenes` table and allow DM editing.
const SCENE_WIDTH = 1400;
const SCENE_HEIGHT = 900;
const BG_COLOR = 0x0f1012; // near-black, matches the app's dark theme
const GRID_STAMP_COLOR = 0x6b7280; // muted gray

export default function BattleMapV2(_props: BattleMapV2Props) {
  void _props; // unused until v2.212

  // The canvas measures to fill its container. We observe the wrapper
  // div with ResizeObserver so the PixiJS Application's internal
  // canvas always matches the surrounding layout.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(300, Math.floor(e.contentRect.width));
        // Cap height — PixiJS resizes the canvas element to match,
        // and an unbounded height on a flex parent can produce a
        // runaway grow loop on some layouts. 700 is enough to feel
        // spacious while staying inside a single viewport on most
        // laptops; future ships will let DMs resize.
        const h = Math.min(700, Math.max(400, Math.floor(e.contentRect.width * 0.5625)));
        setDims({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw a "renderer proof-of-life" stamp in the center of the canvas.
  // v2.210 replaces this with the real square grid rendered into a
  // viewport container. For now this just proves Pixi is alive.
  const drawStamp = useCallback((g: Graphics) => {
    g.clear();
    // Outer frame — shows the scene's total bounds.
    g.setStrokeStyle({ color: GRID_STAMP_COLOR, width: 2, alpha: 0.5 });
    g.rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    g.stroke();
    // Centered crosshair to prove coordinates are what we think.
    g.setStrokeStyle({ color: GRID_STAMP_COLOR, width: 1, alpha: 0.8 });
    g.moveTo(SCENE_WIDTH / 2 - 20, SCENE_HEIGHT / 2);
    g.lineTo(SCENE_WIDTH / 2 + 20, SCENE_HEIGHT / 2);
    g.moveTo(SCENE_WIDTH / 2, SCENE_HEIGHT / 2 - 20);
    g.lineTo(SCENE_WIDTH / 2, SCENE_HEIGHT / 2 + 20);
    g.stroke();
    // A filled circle so we know fill actually works.
    g.setFillStyle({ color: 0xa78bfa, alpha: 0.9 });
    g.circle(SCENE_WIDTH / 2, SCENE_HEIGHT / 2, 8);
    g.fill();
  }, []);

  // Without a viewport we fit-to-canvas: scale the scene uniformly so
  // it fills the available space, then center it. v2.210 replaces this
  // with pixi-viewport for real pan/zoom.
  const scale = Math.min(
    dims.width / SCENE_WIDTH,
    dims.height / SCENE_HEIGHT,
  );
  const offsetX = (dims.width - SCENE_WIDTH * scale) / 2;
  const offsetY = (dims.height - SCENE_HEIGHT * scale) / 2;

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
      {/* v2.209: Pixi Application mounted. Width/height props sync
          the underlying canvas to our measured wrapper dims. */}
      <Application
        width={dims.width}
        height={dims.height}
        background={BG_COLOR}
        antialias={true}
      >
        <pixiContainer
          x={offsetX}
          y={offsetY}
          scale={scale}
        >
          <pixiGraphics draw={drawStamp} />
        </pixiContainer>
      </Application>
      {/* Status overlay — pinned to the top-left corner. pointerEvents
          none so the canvas keeps full input-surface coverage for
          future drag/click handlers. */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          padding: '4px 10px',
          background: 'rgba(15,16,18,0.7)',
          border: '1px solid rgba(167,139,250,0.3)',
          borderRadius: 'var(--r-sm, 4px)',
          fontFamily: 'var(--ff-body)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: '#a78bfa',
          pointerEvents: 'none' as const,
        }}
      >
        BATTLE MAP v2 · PIXI RENDERER · {dims.width}×{dims.height}
      </div>
    </div>
  );
}
