// v2.664.0 — FogBrushLayer.
//
// The DM's manual-fog brush. Only meaningful while the scene is in
// `fog_mode = 'manual'`; the tool button that mounts this is hidden in
// dynamic mode, where reveals are derived rather than painted.
//
// Paint = drag with the left button (reveal), right button or shift
// (hide). Cells are grid-aligned, matching how VisionLayer erases them.
//
// Persistence: a stroke can cross dozens of cells, so writing per
// pointer-move would be a write per mouse pixel. Instead the stroke
// accumulates locally, repaints immediately from local state, and
// commits ONCE on pointer-up. Players see the result through the
// scenes realtime UPDATE that commit produces.
//
// The cell arithmetic lives in src/rules/manualFog.ts — pure, and unit
// tested without a canvas, because a test that imports this file fails
// in CI on node 20 (pixi reads a global `navigator` at module scope).

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import * as scenesApi from '../../../lib/api/scenes';
import {
  applyBrush,
  brushCells,
  cellAtPoint,
  parseRevealedCells,
  serialiseRevealedCells,
} from '../../../rules/manualFog';

export function FogBrushLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  active: boolean;
  gridSizePx: number;
  widthCells: number;
  heightCells: number;
  sceneId: string | null;
  revealedCells: Array<[number, number]>;
  /** Brush radius in cells. 0 paints a single cell. */
  radiusCells: number;
  /** Optimistic local update so the DM sees the stroke as they draw,
   *  before the round trip. */
  onLocalChange: (cells: Array<[number, number]>) => void;
}) {
  const {
    viewport, canvasEl, active, gridSizePx, widthCells, heightCells,
    sceneId, revealedCells, radiusCells, onLocalChange,
  } = props;

  // Brush outline under the cursor, so the DM can see what a click will
  // cover before committing to it.
  const cursorGfxRef = useRef<Graphics | null>(null);
  // Live stroke state. Refs, not state: these mutate on every pointer
  // move and must not drive a React render.
  const paintingRef = useRef<null | { reveal: boolean }>(null);
  const cellsRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef(false);

  // Keep the working set in step with props whenever we're not mid
  // stroke. During a stroke the local set is authoritative — otherwise
  // the realtime echo of our own commit would fight the brush.
  useEffect(() => {
    if (paintingRef.current) return;
    cellsRef.current = parseRevealedCells(revealedCells);
  }, [revealedCells]);

  useEffect(() => {
    if (!viewport || !active) return;
    const gfx = new Graphics();
    gfx.eventMode = 'none';
    viewport.addChild(gfx);
    cursorGfxRef.current = gfx;
    return () => {
      if (!gfx.destroyed) {
        viewport.removeChild(gfx);
        gfx.destroy();
      }
      cursorGfxRef.current = null;
    };
  }, [viewport, active]);

  useEffect(() => {
    if (!canvasEl || !viewport || !active) return;

    function worldFromEvent(e: PointerEvent): { x: number; y: number } | null {
      if (!viewport || !canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      return viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    }

    function drawCursor(world: { x: number; y: number } | null) {
      const gfx = cursorGfxRef.current;
      if (!gfx || gfx.destroyed) return;
      gfx.clear();
      if (!world) return;
      const centre = cellAtPoint(world.x, world.y, gridSizePx);
      const cells = brushCells(centre, radiusCells, widthCells, heightCells);
      for (const c of cells) {
        gfx.rect(c.col * gridSizePx, c.row * gridSizePx, gridSizePx, gridSizePx);
      }
      const hiding = paintingRef.current ? !paintingRef.current.reveal : false;
      gfx.fill({ color: hiding ? 0xef4444 : 0x67e8f9, alpha: 0.18 });
      gfx.setStrokeStyle({ color: hiding ? 0xef4444 : 0x67e8f9, width: 1, alpha: 0.7 });
      for (const c of cells) {
        gfx.rect(c.col * gridSizePx, c.row * gridSizePx, gridSizePx, gridSizePx);
      }
      gfx.stroke();
    }

    /** Paint the brush at this point into the local set. */
    function paintAt(world: { x: number; y: number }) {
      const stroke = paintingRef.current;
      if (!stroke) return;
      const centre = cellAtPoint(world.x, world.y, gridSizePx);
      const cells = brushCells(centre, radiusCells, widthCells, heightCells);
      const next = applyBrush(cellsRef.current, cells, stroke.reveal);
      // applyBrush hands back the SAME object when nothing changed, so
      // this identity check is what keeps a slow drag across one cell
      // from re-rendering and re-committing on every move event.
      if (next === cellsRef.current) return;
      cellsRef.current = next as Set<string>;
      dirtyRef.current = true;
      onLocalChange(serialiseRevealedCells(cellsRef.current));
    }

    function onDown(e: PointerEvent) {
      if (e.target !== canvasEl) return;
      if (e.button !== 0 && e.button !== 2) return;
      const world = worldFromEvent(e);
      if (!world) return;
      // Right-click or shift hides; plain left reveals.
      paintingRef.current = { reveal: e.button === 0 && !e.shiftKey };
      paintAt(world);
      drawCursor(world);
      e.preventDefault();
      e.stopPropagation();
    }

    function onMove(e: PointerEvent) {
      const world = worldFromEvent(e);
      drawCursor(world);
      if (!paintingRef.current || !world) return;
      paintAt(world);
    }

    function onUp() {
      const wasPainting = paintingRef.current !== null;
      paintingRef.current = null;
      if (!wasPainting || !dirtyRef.current || !sceneId) return;
      dirtyRef.current = false;
      // One write per stroke. Fire-and-forget, matching every other
      // map mutation: the store is already optimistic, and the realtime
      // echo reconciles players.
      scenesApi.updateScene(sceneId, {
        revealedCells: serialiseRevealedCells(cellsRef.current),
      }).catch(err => console.error('[FogBrushLayer] commit failed', err));
    }

    function onContextMenu(e: MouseEvent) {
      // Right-drag is the eraser, so suppress the browser menu while
      // the tool is up.
      if (e.target === canvasEl) e.preventDefault();
    }

    window.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvasEl.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true } as any);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvasEl.removeEventListener('contextmenu', onContextMenu);
      // Commit anything still pending if the tool is switched off
      // mid-stroke — losing a stroke to a misclick on the toolbar
      // would be infuriating.
      if (dirtyRef.current && sceneId) {
        dirtyRef.current = false;
        scenesApi.updateScene(sceneId, {
          revealedCells: serialiseRevealedCells(cellsRef.current),
        }).catch(() => {});
      }
    };
  }, [canvasEl, viewport, active, gridSizePx, widthCells, heightCells, sceneId, radiusCells, onLocalChange]);

  return null;
}
