// v2.653.0 — MarqueeLayer. Rubber-band multi-select.
//
// Drag on empty canvas to sweep a rectangle; every token whose
// FOOTPRINT overlaps it lands in the selection. Footprint rather than
// centre point is deliberate — clipping the corner of a Gargantuan
// dragon should select it, and a centre test would make big creatures
// feel unselectable.
//
// DM only. Selection exists to drive bulk edits (delete, hide, lock),
// and every one of those writes is refused for players by RLS, so
// offering the gesture would just be a dead end for them.
//
// Pointer plumbing note (learned the hard way in the v2.653 trial):
// TokenLayer's per-token handler DOES call stopPropagation, but that is
// a *Pixi federated* event. Pixi synthesises those from one DOM
// listener on the canvas; stopping propagation inside Pixi's own event
// graph does nothing to other DOM listeners on that same canvas. So a
// press on a token reached this layer anyway, and dragging a goblin
// swept a marquee at the same time. The guard is therefore explicit:
// hit-test the press point against token footprints and stand down if
// it landed on one.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import type { Token } from '../../../lib/map/mapTypes';
import {
  normaliseRect,
  pointHitsToken,
  tokensInRect,
  type WorldRect,
} from './marqueeGeometry';

/** Below this many world px the gesture reads as a click, not a sweep. */
const MIN_DRAG_PX = 6;

export function MarqueeLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  /** Live tokens to hit-test against. */
  tokens: Token[];
  gridSizePx: number;
  /** Marquee is DM-only; false disables the gesture entirely. */
  enabled: boolean;
  /** Called with the swept ids. `additive` mirrors the shift modifier. */
  onSelect: (ids: string[], additive: boolean) => void;
}) {
  const { viewport, canvasEl, tokens, gridSizePx, enabled, onSelect } = props;
  const gfxRef = useRef<Graphics | null>(null);
  const dragRef = useRef<WorldRect | null>(null);
  // Live values for the once-bound pointer handlers (the FxLayer ref
  // pattern) — re-binding listeners on every token move would thrash.
  const tokensRef = useRef(tokens);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  const gridRef = useRef(gridSizePx);
  useEffect(() => { gridRef.current = gridSizePx; }, [gridSizePx]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    gfxRef.current = g;
    viewport.addChild(g);
    return () => {
      try { viewport.removeChild(g); } catch { /* viewport gone */ }
      try { g.destroy(); } catch { /* already destroyed */ }
      gfxRef.current = null;
      dragRef.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    if (!enabled || !canvasEl || !viewport) return;

    function toWorld(e: PointerEvent) {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      return viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    }

    function redraw() {
      const g = gfxRef.current;
      const d = dragRef.current;
      if (!g) return;
      g.clear();
      if (!d) return;
      const n = normaliseRect(d);
      g.rect(n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1);
      g.fill({ color: 0x60a5fa, alpha: 0.10 });
      g.stroke({ color: 0x60a5fa, width: 1.5, alpha: 0.9 });
    }

    function onPointerDown(e: PointerEvent) {
      // Left button, no modifier that belongs to another gesture:
      // alt is the ping (PingLayer, capture phase), and middle/right
      // drag pans the viewport.
      if (e.button !== 0 || e.altKey) return;
      const w = toWorld(e);
      if (!w) return;
      // Pressing a token means "drag that token" — TokenLayer owns the
      // gesture from here. See the module header for why Pixi's
      // stopPropagation cannot do this for us.
      if (pointHitsToken(tokensRef.current, w.x, w.y, gridRef.current)) return;
      dragRef.current = { x1: w.x, y1: w.y, x2: w.x, y2: w.y };
    }

    function onPointerMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const w = toWorld(e);
      if (!w) return;
      d.x2 = w.x;
      d.y2 = w.y;
      redraw();
    }

    function onPointerUp(e: PointerEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      redraw();
      if (!d) return;
      // A press-and-release without movement is a click on empty map,
      // which means "clear the selection", not "select nothing in a
      // zero-size box" — same outcome here, but the intent matters if
      // this ever grows a click-through behaviour.
      const moved = Math.abs(d.x2 - d.x1) >= MIN_DRAG_PX
        || Math.abs(d.y2 - d.y1) >= MIN_DRAG_PX;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!moved) {
        if (!additive) onSelectRef.current([], false);
        return;
      }
      onSelectRef.current(tokensInRect(tokensRef.current, d, gridRef.current), additive);
    }

    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dragRef.current = null;
      gfxRef.current?.clear();
    };
  }, [enabled, canvasEl, viewport]);

  return null;
}
