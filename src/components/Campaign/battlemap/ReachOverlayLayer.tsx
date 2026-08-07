// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 2).
// See that file's header changelog for this code's full history.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';

/**
 * v2.469.0 — ReachOverlayLayer.
 *
 * Reads battleMapStore.reachPreview. When the DM hovers a melee attack
 * action button in MonsterActionPanel, the panel writes the active
 * token's footprint center + reach in feet to the store; this layer
 * draws a translucent red rectangle covering every cell within
 * Chebyshev reach of the footprint. Hover-leave clears the preview.
 *
 * Geometry: a creature with footprint N cells and reach R feet can
 * attack any cell within Chebyshev distance R/5 of any cell it
 * occupies. The reachable area is therefore a square of side
 * (N + 2*R/5) cells, axis-aligned, centered on the footprint. We
 * render this as a single translucent rectangle — the creature's own
 * footprint is technically inside the rectangle but that's visually
 * fine (it doesn't add information loss vs. cutting it out, and it
 * keeps the geometry trivial).
 *
 * Color: red-orange (#f87171) at 12% fill + 60% stroke. Distinct from
 * the yellow AoE preview (sphere ring), the cyan range preview
 * (dashed circle), and the cyan target highlight (per-token ring).
 * Reach is a "danger zone" indicator — what the active creature CAN
 * HIT — and the warm color reads that way at a glance without being
 * so loud it competes with active combat animations.
 *
 * v2.469.0 history: extracted from VisionLayer, where v2.459 had
 * originally placed it. Hosting it inside the fog/vision layer
 * conflated two unrelated concerns; this dedicated layer is mounted
 * unconditionally alongside VisionLayer in the JSX tree so reach
 * preview behaviour is guaranteed regardless of any vision/fog state
 * (DM with vision off, players, plain map view, etc.).
 */
export function ReachOverlayLayer(props: {
  viewport: Viewport | null;
  gridSizePx: number;
}) {
  const { viewport, gridSizePx } = props;
  const reachPreview = useBattleMapStore(s => s.reachPreview);
  const reachRectRef = useRef<Graphics | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const rect = new Graphics();
    rect.eventMode = 'none';
    rect.visible = false;
    viewport.addChild(rect);
    reachRectRef.current = rect;
    return () => {
      try {
        if (rect.parent && !viewport.destroyed) viewport.removeChild(rect);
        if (!rect.destroyed) rect.destroy();
      } catch { /* viewport torn down */ }
      reachRectRef.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    const rect = reachRectRef.current;
    if (!rect || rect.destroyed) return;
    if (!reachPreview) {
      rect.visible = false;
      return;
    }
    const { centerWorldX: cx, centerWorldY: cy, footprintCells, reachFt } = reachPreview;
    rect.clear();

    // Half-extent in world pixels: footprint half + reach. Footprint
    // contributes (footprintCells/2) cells from the center; reach
    // contributes (reachFt/5) cells beyond that.
    const halfFootPx = (footprintCells * gridSizePx) / 2;
    const reachPx = (reachFt / 5) * gridSizePx;
    const extent = halfFootPx + reachPx;
    const x = cx - extent;
    const y = cy - extent;
    const side = extent * 2;

    rect.setFillStyle({ color: 0xf87171, alpha: 0.12 });
    rect.rect(x, y, side, side);
    rect.fill();
    rect.setStrokeStyle({ color: 0xf87171, width: 2, alpha: 0.60 });
    rect.rect(x, y, side, side);
    rect.stroke();
    // Subtle inner stroke at the footprint boundary so the DM can
    // mentally separate "creature body" from "reach donut" without
    // explicit cutout geometry. 1px stroke at low alpha — informative
    // without competing with the outer reach boundary.
    rect.setStrokeStyle({ color: 0xf87171, width: 1, alpha: 0.35 });
    rect.rect(cx - halfFootPx, cy - halfFootPx, halfFootPx * 2, halfFootPx * 2);
    rect.stroke();
    rect.visible = true;
  }, [reachPreview, gridSizePx]);

  return null;
}
