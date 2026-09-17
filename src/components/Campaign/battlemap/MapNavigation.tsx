import { useEffect, useRef, useState } from 'react';
import type { Viewport } from 'pixi-viewport';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import { tokenFootprintCells } from './shared';
import './MapNavigation.css';
import { MapHistoryControls } from './MapHistoryControls';
import type { useUndoRedo } from '../../../lib/hooks/useUndoRedo';
import { useMapControlClearance } from './useMapControlClearance';

/** v2.697 — local camera controls never write shared token positions. */
export function MapNavigation({ viewport, canvas, selectedIds, gridSizePx, editingToolActive, onSelectMode, history }: {
  history?: ReturnType<typeof useUndoRedo>;
  viewport: Viewport | null;
  canvas: HTMLCanvasElement | null;
  selectedIds: ReadonlySet<string>;
  gridSizePx: number;
  editingToolActive: boolean;
  onSelectMode: () => void;
}) {
  const [pan, setPan] = useState(false);
  const navRef=useRef<HTMLDivElement>(null);
  useMapControlClearance(navRef);
  const [zoom, setZoom] = useState(100);
  useEffect(() => { if (editingToolActive) setPan(false); }, [editingToolActive]);
  useEffect(() => {
    if (!viewport) return;
    const update = () => setZoom(Math.round(viewport.scale.x * 100));
    update();
    viewport.on('zoomed', update);
    return () => { viewport.off('zoomed', update); };
  }, [viewport]);

  const fit = () => {
    if (!viewport) return;
    viewport.plugins.get('decelerate')?.reset();
    viewport.setZoom(Math.min(viewport.screenWidth / viewport.worldWidth, viewport.screenHeight / viewport.worldHeight) * 0.8, true);
    viewport.moveCenter(viewport.worldWidth / 2, viewport.worldHeight / 2);
    setZoom(Math.round(viewport.scale.x * 100));
  };
  const changeZoom = (factor: number) => {
    if (!viewport) return;
    viewport.setZoom(Math.min(4, Math.max(Math.min(0.25, viewport.screenWidth / viewport.worldWidth * 0.8, viewport.screenHeight / viewport.worldHeight * 0.8), viewport.scale.x * factor)), true);
    setZoom(Math.round(viewport.scale.x * 100));
  };
  const focus = () => {
    if (!viewport) return;
    const tokens = Object.values(useBattleMapStore.getState().tokens).filter(t => selectedIds.has(t.id));
    if (!tokens.length) return;
    viewport.plugins.get('decelerate')?.reset();
    // Even-sized tokens anchor at the footprint corner; match their visual center.
    const centers = tokens.map(t => {
      const cells = tokenFootprintCells(t.size);
      const offset = cells % 2 === 0 ? cells * gridSizePx / 2 : 0;
      return { x: t.x + offset, y: t.y + offset };
    });
    viewport.moveCenter(centers.reduce((sum,t) => sum+t.x,0)/centers.length, centers.reduce((sum,t) => sum+t.y,0)/centers.length);
  };

  useEffect(() => {
    if (!canvas || !viewport) return;
    let hovering = false, space = false;
    let suppressClickUntil = 0;
    let drag: { id: number; x: number; y: number } | null = null;
    const touches = new Map<number, { x: number; y: number }>();
    const touchPair = () => {
      const [a, b] = [...touches.values()];
      return a && b ? { x: (a.x+b.x)/2, y: (a.y+b.y)/2, distance: Math.hypot(a.x-b.x, a.y-b.y) } : null;
    };
    const originalCursor = canvas.style.cursor;
    const cursor = () => { canvas.style.cursor = drag ? 'grabbing' : pan || space ? 'grab' : originalCursor; };
    const enter = () => { hovering = true; cursor(); };
    const leave = () => { hovering = false; };
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (!pan && !space) || (drag && event.pointerType !== 'touch')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      viewport.plugins.get('decelerate')?.reset();
      if (event.pointerType === 'touch') touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!drag) drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId); cursor();
    };
    const move = (event: PointerEvent) => {
      // v2.698 — Pan owns all fingers, including a pinch over a token.
      // Keep the world point under the midpoint fixed while zooming.
      if (touches.has(event.pointerId)) {
        const before = touchPair();
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const after = touchPair();
        if (before && after) {
          event.preventDefault(); event.stopImmediatePropagation();
          const rect = canvas.getBoundingClientRect();
          const anchor = viewport.toWorld(before.x-rect.left, before.y-rect.top);
          if (before.distance > 0) {
            const min = Math.min(0.25, viewport.screenWidth/viewport.worldWidth*0.8, viewport.screenHeight/viewport.worldHeight*0.8);
            viewport.setZoom(Math.max(min, Math.min(4, viewport.scale.x*after.distance/before.distance)), true);
          }
          const shifted = viewport.toWorld(after.x-rect.left, after.y-rect.top);
          viewport.moveCenter(viewport.center.x+anchor.x-shifted.x, viewport.center.y+anchor.y-shifted.y);
          setZoom(Math.round(viewport.scale.x*100));
          return;
        }
      }
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault(); event.stopImmediatePropagation();
      viewport.moveCenter(viewport.center.x - (event.clientX-drag.x)/viewport.scale.x, viewport.center.y - (event.clientY-drag.y)/viewport.scale.y);
      drag.x=event.clientX; drag.y=event.clientY;
    };
    const end = (event: PointerEvent) => {
      if (touches.delete(event.pointerId)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        const remaining = [...touches.entries()][0];
        drag = remaining ? { id: remaining[0], ...remaining[1] } : null;
        suppressClickUntil = Date.now()+150;
        cursor();
        return;
      }
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const id=drag.id; drag=null;
      suppressClickUntil = Date.now() + 150;
      if(canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      cursor();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (!hovering || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space') { event.preventDefault(); space=true; cursor(); }
    };
    const keyUp = (event: KeyboardEvent) => { if(event.code==='Space') { space=false; cursor(); } };
    const blur = () => {
      space=false;
      for (const id of touches.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      touches.clear();
      if(drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      drag=null; cursor();
    };
    // v2.700 — Window capture beats group selection and Pixi listeners. A pan
    // beginning over a token cannot select, move, ping, or paint it.
    const host=canvas.parentElement!;
    const swallowClick = (event: MouseEvent) => { if((pan || space || Date.now() < suppressClickUntil) && event.target===canvas) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const hostDown = (event: PointerEvent) => { if(event.target===canvas) down(event); };
    window.addEventListener('pointerdown',hostDown,true);
    host.addEventListener('pointermove',move,true);
    host.addEventListener('pointerup',end,true);
    host.addEventListener('pointercancel',end,true);
    host.addEventListener('click',swallowClick,true);
    canvas.addEventListener('pointerenter',enter); canvas.addEventListener('pointerleave',leave);
    window.addEventListener('keydown',keyDown); window.addEventListener('keyup',keyUp); window.addEventListener('blur',blur);
    cursor();
    return () => {
      blur(); canvas.style.cursor=originalCursor;
      window.removeEventListener('pointerdown',hostDown,true); host.removeEventListener('pointermove',move,true);
      host.removeEventListener('pointerup',end,true); host.removeEventListener('pointercancel',end,true); host.removeEventListener('click',swallowClick,true);
      canvas.removeEventListener('pointerenter',enter); canvas.removeEventListener('pointerleave',leave);
      window.removeEventListener('keydown',keyDown); window.removeEventListener('keyup',keyUp); window.removeEventListener('blur',blur);
    };
  }, [canvas, viewport, pan]);

  return <div ref={navRef} className="map-navigation" role="toolbar" aria-label="Map navigation">
    <div className="map-navigation-modes">
      <button type="button" aria-pressed={!pan && !editingToolActive} onClick={()=>{setPan(false); onSelectMode();}} title="Select and move tokens">Select</button>
      <button type="button" aria-pressed={pan} onClick={()=>{setPan(true); onSelectMode();}} title="Drag the map · hold Space for temporary pan">Pan</button>
    </div>
    <div className="map-navigation-zoom">
      <button type="button" aria-label="Zoom out" onClick={()=>changeZoom(1/1.2)}>−</button>
      <output aria-label="Map zoom">{zoom}%</output>
      <button type="button" aria-label="Zoom in" onClick={()=>changeZoom(1.2)}>+</button>
    </div>
    <button type="button" onClick={fit} title="Show the entire map">Fit map</button>
    <button type="button" onClick={focus} disabled={!selectedIds.size} title="Center the view on selected tokens">Find selection</button>
    {history && <MapHistoryControls history={history} />}
  </div>;
}
