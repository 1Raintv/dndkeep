import { useEffect, useRef, useState } from 'react';
import type { Viewport } from 'pixi-viewport';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import { boundsFrame, selectionFrame } from './selectionFrame';
import './MapNavigation.css';
import { MapHistoryControls } from './MapHistoryControls';
import type { useUndoRedo } from '../../../lib/hooks/useUndoRedo';
import { useMapControlClearance } from './useMapControlClearance';
import { MapHelp } from './MapHelp';
import { MapControlIcon } from './MapControlIcon';
import { useMapNavigationShortcuts } from './useMapNavigationShortcuts';
import { usePreviousMapView } from './usePreviousMapView';

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
  const sceneId=useBattleMapStore(s=>s.currentSceneId);
  const previousView=usePreviousMapView(viewport,sceneId);
  useEffect(() => { if (editingToolActive) setPan(false); }, [editingToolActive]);
  useEffect(() => {
    if (!viewport) return;
    const update = () => setZoom(Math.round(viewport.scale.x * 100));
    update();
    viewport.on('zoomed', update);
    return () => { viewport.off('zoomed', update); };
  }, [viewport]);

  const fit = () => {
    if (!viewport || !canvas) return;
    const frame=boundsFrame(0,0,viewport.worldWidth,viewport.worldHeight,viewport.screenWidth,viewport.screenHeight,4,clearArea());
    if(!frame)return;
    previousView.remember(frame);
    viewport.plugins.get('decelerate')?.reset();
    // v2.709 — the viewport's full-canvas zoom floor would undo a tighter fit.
    viewport.clampZoom({minScale:Math.min(.25,frame.zoom),maxScale:4});
    viewport.setZoom(frame.zoom, true);
    viewport.moveCenter(frame.x,frame.y);
    setZoom(Math.round(viewport.scale.x * 100));
  };
  const chooseZoom = (scale: number) => {
    if (!viewport) return;
    // v2.713 — stop residual pan momentum and retain the same world center.
    // setZoom also respects the live clamp, including a fitted zoom floor.
    viewport.plugins.get('decelerate')?.reset();
    viewport.setZoom(scale, true);
    setZoom(Math.round(viewport.scale.x * 100));
  };
  const clearArea = () => {
    const rect=canvas!.getBoundingClientRect();
    const host=canvas!.parentElement;
    const rail=host?.querySelector('.map-tool-palette')?.getBoundingClientRect();
    const actions=host?.querySelector('.map-selection-actions')?.getBoundingClientRect();
    const dock=navRef.current?.getBoundingClientRect();
    return {
      left:rail ? rail.right-rect.left+12 : 12,
      top:Math.max(60,actions ? actions.bottom-rect.top+12 : 0),
      right:viewport!.screenWidth-12,
      bottom:Math.min(viewport!.screenHeight-12,dock ? dock.top-rect.top-12 : viewport!.screenHeight-12),
    };
  };
  const focus = () => {
    if (!viewport || !canvas) return;
    const tokens = Object.values(useBattleMapStore.getState().tokens).filter(t => selectedIds.has(t.id));
    const frame=selectionFrame(tokens,gridSizePx,viewport.screenWidth,viewport.screenHeight,viewport.scale.x,clearArea());
    if (!frame) return;
    previousView.remember(frame);
    viewport.plugins.get('decelerate')?.reset();
    viewport.clampZoom({minScale:Math.min(.25,frame.zoom),maxScale:4});
    viewport.setZoom(frame.zoom,true);
    viewport.moveCenter(frame.x,frame.y);
    setZoom(Math.round(frame.zoom*100));
  };
  useMapNavigationShortcuts(canvas,{zoom:factor=>{if(viewport)chooseZoom(viewport.scale.x*factor);},fit,focus:selectedIds.size ? focus : undefined});

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
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,button,summary,a,[contenteditable="true"],[role="textbox"]');
    const down = (event: PointerEvent) => {
      // v2.735 — middle pan uses the same capture/cancel path as Space pan,
      // including over tokens. Never take over a primary-button token drag.
      const middle=event.button===1 && event.buttons===4;
      if ((!middle && (event.button !== 0 || (!pan && !space))) || (drag && event.pointerType !== 'touch')) return;
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
            viewport.setZoom(viewport.scale.x*after.distance/before.distance, true);
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
      if(event.key==='Escape' && drag) {event.preventDefault();event.stopImmediatePropagation();blur();return;}
      if (!hovering || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space') { event.preventDefault(); space=true; cursor(); }
    };
    const keyUp = (event: KeyboardEvent) => { if(event.code==='Space') { space=false; cursor(); } };
    const blur = () => {
      space=false;
      // v2.704 — clear ownership before releasing capture: cancellation can
      // itself emit lostpointercapture, and must not leave a ghost pan alive.
      const ids=new Set(touches.keys());if(drag) ids.add(drag.id);
      touches.clear();drag=null;suppressClickUntil=Date.now()+150;
      for(const id of ids) if(canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      cursor();
    };
    const lostCapture=(event:PointerEvent)=>{if(touches.has(event.pointerId) || drag?.id===event.pointerId) blur();};
    const hidden=()=>{if(document.visibilityState==='hidden') blur();};
    // v2.700 — Window capture beats group selection and Pixi listeners. A pan
    // beginning over a token cannot select, move, ping, or paint it.
    const host=canvas.parentElement!;
    const swallowClick = (event: MouseEvent) => { if((event.button===1 || pan || space || Date.now() < suppressClickUntil) && event.target===canvas) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const hostDown = (event: PointerEvent) => { if(event.target===canvas) down(event); };
    window.addEventListener('pointerdown',hostDown,true);
    host.addEventListener('pointermove',move,true);
    host.addEventListener('pointerup',end,true);
    host.addEventListener('pointercancel',end,true);
    canvas.addEventListener('lostpointercapture',lostCapture);
    document.addEventListener('visibilitychange',hidden);
    host.addEventListener('click',swallowClick,true);
    host.addEventListener('auxclick',swallowClick,true);
    canvas.addEventListener('pointerenter',enter); canvas.addEventListener('pointerleave',leave);
    window.addEventListener('keydown',keyDown,true); window.addEventListener('keyup',keyUp); window.addEventListener('blur',blur);
    cursor();
    return () => {
      blur(); canvas.style.cursor=originalCursor;
      window.removeEventListener('pointerdown',hostDown,true); host.removeEventListener('pointermove',move,true);
      host.removeEventListener('pointerup',end,true); host.removeEventListener('pointercancel',end,true); host.removeEventListener('click',swallowClick,true);
      host.removeEventListener('auxclick',swallowClick,true);
      canvas.removeEventListener('lostpointercapture',lostCapture);document.removeEventListener('visibilitychange',hidden);
      canvas.removeEventListener('pointerenter',enter); canvas.removeEventListener('pointerleave',leave);
      window.removeEventListener('keydown',keyDown,true); window.removeEventListener('keyup',keyUp); window.removeEventListener('blur',blur);
    };
  }, [canvas, viewport, pan]);

  return <div ref={navRef} className="map-navigation" role="toolbar" aria-label="Map navigation">
    <div className="map-navigation-modes">
      <button type="button" aria-pressed={!pan && !editingToolActive} onClick={()=>{setPan(false); onSelectMode();}} title="Select and move tokens"><MapControlIcon kind="select"/>Select</button>
      <button type="button" aria-pressed={pan} onClick={()=>{setPan(true); onSelectMode();}} title="Drag the map · hold Space for temporary pan"><MapControlIcon kind="pan"/>Pan</button>
    </div>
    <div className="map-navigation-zoom">
      <button type="button" aria-label="Zoom out" onClick={()=>viewport && chooseZoom(viewport.scale.x/1.2)}>−</button>
      <select aria-label="Map zoom" title="Choose zoom level" value={zoom} onChange={event=>chooseZoom(Number(event.target.value)/100)}>
        {/* Keep wheel/pinch/Fit values visible without rounding the actual camera. */}
        {[...new Set([25,50,100,200,400,zoom])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{value}%</option>)}
      </select>
      <button type="button" aria-label="Zoom in" onClick={()=>viewport && chooseZoom(viewport.scale.x*1.2)}>+</button>
    </div>
    <div className="map-navigation-framing">
      <button type="button" onClick={fit} title="Show the entire map"><MapControlIcon kind="fit"/>Fit map</button>
      <button type="button" aria-label="Previous view" title="Return to your view before Fit map or Find selection" disabled={!previousView.canReturn}
        onClick={()=>{const scale=previousView.restore();if(scale!==null)setZoom(Math.round(scale*100));}}><MapControlIcon kind="back"/></button>
    </div>
    <button type="button" onClick={focus} disabled={!selectedIds.size} title="Bring all selected tokens into view (F over the map)"><MapControlIcon kind="focus"/>Find selection</button>
    <MapHelp />
    {history && <MapHistoryControls history={history} />}
  </div>;
}
