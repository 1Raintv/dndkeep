// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useRef } from 'react';
import { useBattleMapStore, type Wall } from '../../../lib/stores/battleMapStore';
import * as wallsApi from '../../../lib/api/sceneWalls';
import { pointSegmentDistance, snapToGridCorner } from './shared';

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
export function WallLayer(props: {
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
    // v2.271.0 — three visual states based on doorState:
    //   - solid wall (doorState === null): purple stroke, the
    //     existing default
    //   - closed door (doorState === 'closed'): warm gold stroke so
    //     it reads as "different from a wall, but still blocking" —
    //     conceptually a wooden door
    //   - open door (doorState === 'open'): dashed faint gold so the
    //     DM sees the gap exists but visually it's clearly passable
    //
    // We render in three passes (one per state) because Pixi v8
    // Graphics doesn't support per-segment stroke styles on a single
    // path — a single moveTo/lineTo/stroke chain commits one style.
    // Walls per scene are typically <50, so the three-pass cost is
    // immaterial.
    const baseAlpha = active ? 0.95 : 0.85;
    const allWalls = Object.values(walls);
    const nonDoors = allWalls.filter(w => w.doorState === null);
    const closedDoors = allWalls.filter(w => w.doorState === 'closed');
    const openDoors = allWalls.filter(w => w.doorState === 'open');

    // v2.661.0 — pass 1 split by material, because a DM who can't see
    // which walls are low or glazed can't tell why a shot got half
    // cover instead of total. Purple stays the solid/legacy colour so
    // existing maps look unchanged; the two lesser materials read as
    // visibly thinner and cooler.
    //   solid + legacy null — purple, 3px  (total / legacy half)
    //   low                 — slate, 2px   (half cover)
    //   window              — cyan,  2px   (three-quarters)
    const MATERIAL_STYLE: Record<string, { color: number; width: number }> = {
      wall:   { color: 0xa78bfa, width: 3 },
      low:    { color: 0x94a3b8, width: 2 },
      window: { color: 0x67e8f9, width: 2 },
    };
    for (const [material, style] of Object.entries(MATERIAL_STYLE)) {
      // Legacy untyped walls ride along with 'wall' so they keep the
      // look they have always had, even though they score as a small
      // obstacle rather than as solid.
      const group = nonDoors.filter(w =>
        material === 'wall' ? (w.wallType === 'wall' || w.wallType == null)
                            : w.wallType === material
      );
      if (group.length === 0) continue;
      gfx.setStrokeStyle({ ...style, alpha: baseAlpha });
      for (const w of group) {
        gfx.moveTo(w.x1, w.y1);
        gfx.lineTo(w.x2, w.y2);
      }
      gfx.stroke();
    }

    // Pass 2: closed doors — warm gold, slightly thicker so they
    // read as a noticeable interactive feature.
    if (closedDoors.length > 0) {
      gfx.setStrokeStyle({ color: 0xd4a017, width: 4, alpha: baseAlpha });
      for (const w of closedDoors) {
        gfx.moveTo(w.x1, w.y1);
        gfx.lineTo(w.x2, w.y2);
      }
      gfx.stroke();
    }

    // Pass 3: open doors — faint gold "ghost" segments so the gap is
    // visible but obviously walkable. We approximate the dashed look
    // with a lower alpha + thinner stroke (Pixi v8 doesn't have
    // first-class line dash support; a true dash would need to
    // segment each door into N pieces, which is more code than
    // value here).
    if (openDoors.length > 0) {
      gfx.setStrokeStyle({ color: 0xd4a017, width: 2, alpha: baseAlpha * 0.4 });
      for (const w of openDoors) {
        gfx.moveTo(w.x1, w.y1);
        gfx.lineTo(w.x2, w.y2);
      }
      gfx.stroke();
    }
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

    /** v2.661.0 — id of the wall nearest `world` within the click
     *  threshold, or null. Extracted when ctrl+click retype became the
     *  third caller of this loop (right-click delete and shift+click
     *  door toggle were the first two, copy-pasted). One threshold,
     *  one scene filter, one tie-break rule for all three. */
    function nearestWallId(world: { x: number; y: number }): string | null {
      const THRESHOLD = Math.max(6, gridSizePx * 0.25);
      let best: { id: string; dist: number } | null = null;
      for (const w of Object.values(useBattleMapStore.getState().walls)) {
        if (w.sceneId !== currentSceneId) continue;
        const d = pointSegmentDistance(world.x, world.y, w.x1, w.y1, w.x2, w.y2);
        if (d < THRESHOLD && (!best || d < best.dist)) {
          best = { id: w.id, dist: d };
        }
      }
      return best?.id ?? null;
    }

    function onDown(e: PointerEvent) {
      // Only intercept events targeting the canvas.
      if (e.target !== canvasEl) return;

      // Right-click = delete nearest wall (within threshold).
      if (e.button === 2) {
        const world = worldFromEvent(e);
        if (!world) return;
        const nearest = nearestWallId(world);
        if (nearest) {
          // Optimistic local remove + async DB delete.
          useBattleMapStore.getState().removeWall(nearest);
          wallsApi.deleteWall(nearest).catch(err =>
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

      // v2.271.0 — shift+left-click = cycle door state on nearest
      // wall (within the same threshold the right-click delete uses).
      // The cycle is: solid wall → closed door → open door → solid.
      // Solid + closed both block sight + movement; open blocks
      // neither. Authoring-time intent: most walls are solid; a few
      // get cycled to closed-door at setup; mid-session the DM
      // shift-clicks to flip closed↔open as players approach.
      // Skips placement: when this branch fires, we don't continue
      // into the vertex-placement flow below.
      // v2.661.0 — ctrl+left-click = cycle MATERIAL on nearest wall,
      // the sibling of shift+click's door cycle: solid → low → window
      // → solid. Ctrl rather than alt because alt+click is the ping
      // (v2.653). Doors are skipped — their cover comes from
      // doorState, so giving them a material would be two sources of
      // truth for the same segment.
      if (e.ctrlKey || e.metaKey) {
        const nearest = nearestWallId(world);
        if (nearest) {
          const wall = useBattleMapStore.getState().walls[nearest];
          if (wall && wall.doorState === null) {
            const nextType: Wall['wallType'] =
              wall.wallType === 'wall' ? 'low'
              : wall.wallType === 'low' ? 'window'
              : 'wall';   // covers 'window' and legacy null
            useBattleMapStore.getState().updateWall(nearest, { wallType: nextType });
            wallsApi.updateWall(nearest, { wallType: nextType }).catch(err =>
              console.error('[WallLayer] updateWall (wallType) failed', err)
            );
          }
        }
        e.preventDefault();
        return;
      }

      if (e.shiftKey) {
        const nearest = nearestWallId(world);
        if (nearest) {
          const wall = useBattleMapStore.getState().walls[nearest];
          if (wall) {
            // Cycle: null → 'closed' → 'open' → null
            const nextState: Wall['doorState'] =
              wall.doorState === null ? 'closed'
              : wall.doorState === 'closed' ? 'open'
              : null;
            // v2.661.0 — becoming a door clears any material, and
            // ceasing to be one restores the default. Otherwise a
            // segment cycled wall→door→wall would keep a stale
            // wall_type that coverType silently ignores while it is a
            // door, and that would resurface on the way back out.
            const patch: Partial<Wall> = {
              doorState: nextState,
              wallType: nextState === null ? 'wall' : null,
            };
            // Optimistic update + async DB patch. Realtime echo is
            // idempotent (updateWall merges patch into existing) so
            // the originator's echo is a no-op.
            useBattleMapStore.getState().updateWall(nearest, patch);
            wallsApi.updateWall(nearest, patch).catch(err =>
              console.error('[WallLayer] updateWall failed', err)
            );
          }
        }
        e.preventDefault();
        return;
      }

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
          // v2.661.0 — walls drawn from now on carry a material so
          // they score real cover. Read at commit time rather than
          // captured in the effect, so switching type mid-chain
          // applies to the next segment.
          wallType: useBattleMapStore.getState().wallDrawType,
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
