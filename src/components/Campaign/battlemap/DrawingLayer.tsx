// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 2).
// See that file's header changelog for this code's full history.

import { Container, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { useBattleMapStore, type SceneDrawing, type DrawingKind } from '../../../lib/stores/battleMapStore';
import * as drawingsApi from '../../../lib/api/sceneDrawings';
import * as wallsApi from '../../../lib/api/sceneWalls';
import { useModal } from '../../shared/Modal';
import { pointSegmentDistance } from './shared';

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
export function DrawingLayer(props: {
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
  recordUndoable?: (action: import('../../../lib/hooks/useUndoRedo').UndoableAction) => void;
  // v2.269.0 — eraser mode. When true, this layer attaches a separate
  // pointer effect: left-click anywhere → if the click landed on a
  // drawing, delete it (with undo). No confirm dialog — eraser-mode
  // is itself the explicit intent. Right-click context-menu delete
  // (which DOES confirm) remains available outside eraser mode.
  // Misses on empty space are silent no-ops; no toast spam.
  eraserActive?: boolean;
  // v2.287.0 — Eraser also targets walls now; the wall-detection
  // threshold scales with grid size (max(6, gridSizePx*0.25)) to
  // match the wall-mode right-click-delete feel. Plumbed in as a
  // prop because the store doesn't carry grid info — it's a
  // viewport/scene rendering concern owned by the parent.
  gridSizePx?: number;
}) {
  const { viewport, canvasEl, activeKind, isDM, currentSceneId, color, lineWidth, selectMode, recordUndoable, eraserActive, gridSizePx } = props;
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

    // v2.287.0 — Shape-aware hit-test, replacing the v2.269 AABB pad.
    // The old test (`world inside child.getBounds() padded 6px`) erased
    // any drawing whose axis-aligned bounding box covered the click —
    // disastrous for diagonal lines and large pencil strokes whose AABB
    // is mostly empty space. New approach: per-shape distance to the
    // visually-occupied geometry; a click "hits" if that distance is
    // <= the drawing's stroke half-width plus a tolerance band so thin
    // lines remain easy to grab on touchscreens / high-DPI.
    function distanceToDrawing(world: { x: number; y: number }, d: SceneDrawing): number {
      const pts = d.points;
      if (!pts || pts.length === 0) return Infinity;
      switch (d.kind) {
        case 'line': {
          // Two-point primitive: distance to the segment.
          if (pts.length < 2) return Infinity;
          return pointSegmentDistance(world.x, world.y, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
        }
        case 'pencil': {
          // Polyline: distance to the nearest segment. Single-point
          // pencil dabs (kind === 'pencil' with 1 point) fall back to
          // straight Euclidean distance to that point.
          if (pts.length === 1) {
            const dx = world.x - pts[0].x;
            const dy = world.y - pts[0].y;
            return Math.sqrt(dx * dx + dy * dy);
          }
          let best = Infinity;
          for (let i = 1; i < pts.length; i++) {
            const dist = pointSegmentDistance(
              world.x, world.y,
              pts[i - 1].x, pts[i - 1].y,
              pts[i].x, pts[i].y,
            );
            if (dist < best) best = dist;
          }
          return best;
        }
        case 'rect': {
          // Two-point primitive: stroked rectangle. Distance is to the
          // nearest edge (4 segments of the perimeter). Filled-rect
          // semantics aren't used — drawings are stroked outlines —
          // so interior clicks should NOT erase.
          if (pts.length < 2) return Infinity;
          const x1 = Math.min(pts[0].x, pts[1].x);
          const y1 = Math.min(pts[0].y, pts[1].y);
          const x2 = Math.max(pts[0].x, pts[1].x);
          const y2 = Math.max(pts[0].y, pts[1].y);
          const dTop    = pointSegmentDistance(world.x, world.y, x1, y1, x2, y1);
          const dRight  = pointSegmentDistance(world.x, world.y, x2, y1, x2, y2);
          const dBottom = pointSegmentDistance(world.x, world.y, x1, y2, x2, y2);
          const dLeft   = pointSegmentDistance(world.x, world.y, x1, y1, x1, y2);
          return Math.min(dTop, dRight, dBottom, dLeft);
        }
        case 'circle': {
          // Two-point primitive: center + edge. Distance is |dist-radius|
          // so clicks on the stroke ring hit, interior clicks miss.
          if (pts.length < 2) return Infinity;
          const cx = pts[0].x, cy = pts[0].y;
          const dx = pts[1].x - cx, dy = pts[1].y - cy;
          const radius = Math.sqrt(dx * dx + dy * dy);
          const ddx = world.x - cx, ddy = world.y - cy;
          const distFromCenter = Math.sqrt(ddx * ddx + ddy * ddy);
          return Math.abs(distFromCenter - radius);
        }
        default:
          return Infinity;
      }
    }

    function findDrawingAt(world: { x: number; y: number }): { drawing: SceneDrawing; dist: number } | null {
      // Iterate the live store (not Pixi children) so the test is
      // independent of render order and uses real geometry data.
      // The eraser's "frontmost wins" tiebreaker matters only on
      // genuine overlaps; we resolve it via lowest-distance instead,
      // which feels right when two shapes are equally close (the one
      // whose stroke is exactly under the cursor wins).
      const all = Object.values(useBattleMapStore.getState().drawings);
      let best: { drawing: SceneDrawing; dist: number } | null = null;
      for (const d of all) {
        if (d.sceneId !== currentSceneId) continue;
        const dist = distanceToDrawing(world, d);
        // Hit threshold: stroke half-width + 6px tolerance band.
        // The band keeps thin 1-2px lines reachable even when the
        // user clicks 4-5px off-center, matching the v2.269 pad.
        const threshold = (d.lineWidth ?? 2) / 2 + 6;
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { drawing: d, dist };
        }
      }
      return best;
    }

    // v2.287.0 — Walls are now eraser-targets too. Previously the
    // eraser only handled scene_drawings; users had to switch to wall
    // mode and right-click to delete a wall. Now eraser mode treats
    // walls and drawings as one pool — the closer hit wins. Threshold
    // mirrors the wall-mode delete (max(6, gridSize*0.25)) so the
    // feel is consistent across modes.
    function findWallAt(world: { x: number; y: number }, gridSizePx: number): { wall: import('../../../lib/stores/battleMapStore').Wall; dist: number } | null {
      const threshold = Math.max(6, gridSizePx * 0.25);
      let best: { wall: import('../../../lib/stores/battleMapStore').Wall; dist: number } | null = null;
      for (const w of Object.values(useBattleMapStore.getState().walls)) {
        if (w.sceneId !== currentSceneId) continue;
        const dist = pointSegmentDistance(world.x, world.y, w.x1, w.y1, w.x2, w.y2);
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { wall: w, dist };
        }
      }
      return best;
    }

    function onPointerDown(e: MouseEvent) {
      if (e.button !== 0) return; // primary only
      const w = clientToWorld(e);
      if (!w) return;
      const drawingHit = findDrawingAt(w);
      // gridSizePx threshold tracks the wall-mode delete feel; falls
      // back to 50 (a reasonable default cell size in world px) if the
      // prop wasn't plumbed in for some reason.
      const gridPx = gridSizePx ?? 50;
      const wallHit = findWallAt(w, gridPx);

      // Pick the closer of the two if both hit. Drawing-only or wall-
      // only cases just use whichever is non-null.
      let target: { kind: 'drawing'; drawing: SceneDrawing } | { kind: 'wall'; wall: import('../../../lib/stores/battleMapStore').Wall } | null = null;
      if (drawingHit && wallHit) {
        target = drawingHit.dist <= wallHit.dist
          ? { kind: 'drawing', drawing: drawingHit.drawing }
          : { kind: 'wall', wall: wallHit.wall };
      } else if (drawingHit) {
        target = { kind: 'drawing', drawing: drawingHit.drawing };
      } else if (wallHit) {
        target = { kind: 'wall', wall: wallHit.wall };
      }

      if (!target) {
        // Silent miss — clicking empty space in eraser mode is a no-op.
        // Adding a toast here would spam the user during normal scrub-
        // looking-for-shapes behavior.
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      if (target.kind === 'drawing') {
        const found = target.drawing;
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
      } else {
        // Wall delete + undo. createWall writes a fresh row using the
        // same id, which is fine — Postgres will accept it because we
        // deleted the prior row first. The store's addWall/removeWall
        // are idempotent on re-execution.
        const wall = target.wall;
        const snapshot = { ...wall };
        useBattleMapStore.getState().removeWall(wall.id);
        wallsApi.deleteWall(wall.id).catch(err =>
          console.error('[DrawingLayer] eraser deleteWall failed', err));
        recordUndoableRef.current?.({
          label: 'erase wall',
          forward: () => {
            useBattleMapStore.getState().removeWall(snapshot.id);
            return wallsApi.deleteWall(snapshot.id).then(() => undefined);
          },
          backward: () => {
            useBattleMapStore.getState().addWall(snapshot);
            return wallsApi.createWall(snapshot).then(() => undefined);
          },
        });
      }
    }

    canvasEl.addEventListener('pointerdown', onPointerDown);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
    };
  }, [eraserActive, canvasEl, viewport, isDM, currentSceneId, gridSizePx]);

  return null;
}
