// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { snapToCellCenter } from '../../../lib/map/coords';

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
export function RulerLayer(props: {
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
