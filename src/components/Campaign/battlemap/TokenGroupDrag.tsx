import {isTokenMovePending} from './pendingTokenMoves';
import {groupDragPreview} from './groupDragPreview';
import { useEffect, useRef } from 'react';
import type { Viewport } from 'pixi-viewport';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import type { UndoableAction } from '../../../lib/hooks/useUndoRedo';
import { tokenBoundsWorld } from './marqueeGeometry';
import { commitTokenGroup } from './commitTokenGroup';
import { tokenMoveHistory } from './tokenMoveHistory';
import { useToast } from '../../shared/Toast';

/** v2.700 — capture group gestures before Pixi's single-token drag path.
 * Pan's window capture listener still wins; combat/tools disable this path. */
export function TokenGroupDrag(props: {
  canvas: HTMLCanvasElement|null; viewport: Viewport|null; enabled: boolean;
  selectedIds: ReadonlySet<string>; gridSize: number; campaignId: string;
  record: (action:UndoableAction)=>void;
  start: (ids:string[])=>void; move: (id:string,x:number,y:number)=>void;
  end: (ids:string[])=>void;
}) {
  const {canvas,viewport,enabled,selectedIds,gridSize,campaignId,record,start,move,end}=props;
  const busy=useRef(false);
  const {showToast}=useToast();
  useEffect(()=>{
    if(!enabled || !canvas || !viewport || selectedIds.size<2) return;
    const feedback=groupDragPreview(viewport,gridSize);
    const sceneId=useBattleMapStore.getState().currentSceneId;
    let drag: {pointer:number; x:number; y:number; tokens:Token[]; dx:number; dy:number}|null=null;
    let suppressUntil=0, lastBroadcast=0;
    const current=()=>useBattleMapStore.getState().currentSceneId===sceneId;
    const bounds=(t:Token)=>{
      const b=tokenBoundsWorld(t,gridSize);
      return {left:b.x1,top:b.y1,size:b.x2-b.x1};
    };
    const point=(event:PointerEvent)=>{const r=canvas.getBoundingClientRect();return viewport.toWorld(event.clientX-r.left,event.clientY-r.top);};
    const swallow=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
    const down=(event:PointerEvent)=>{
      if(event.target!==canvas) return;
      if(event.button!==0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if(busy.current) {swallow(event);return;}
      if(drag) {swallow(event);return;}
      const store=useBattleMapStore.getState();
      const tokens=[...selectedIds].map(id=>store.tokens[id]);
      if(store.dragging || tokens.some(t=>!t || store.remoteDragLocks[t.id])) return;
      const p=point(event);
      if(!tokens.some(t=>{const b=bounds(t);return p.x>=b.left && p.x<=b.left+b.size && p.y>=b.top && p.y<=b.top+b.size;})) return;
      if(tokens.some(t=>isTokenMovePending(t.id))){swallow(event);showToast('A selected token is still saving. Please wait.','info');return;}
      swallow(event);
      viewport.plugins.get('decelerate')?.reset();
      drag={pointer:event.pointerId,x:p.x,y:p.y,tokens,dx:0,dy:0};
      store.setDragging(tokens[0].id);
      start(tokens.map(t=>t.id));
      canvas.setPointerCapture(event.pointerId);
    };
    const preview=(event:PointerEvent)=>{
      if(!drag || drag.pointer!==event.pointerId) return;
      swallow(event);
      const p=point(event), boxes=drag.tokens.map(bounds);
      // Clamp one shared grid delta, preserving relative positions and footprints.
      const minX=Math.ceil(Math.max(...boxes.map(b=>-b.left))/gridSize)*gridSize;
      const maxX=Math.floor(Math.min(...boxes.map(b=>viewport.worldWidth-b.left-b.size))/gridSize)*gridSize;
      const minY=Math.ceil(Math.max(...boxes.map(b=>-b.top))/gridSize)*gridSize;
      const maxY=Math.floor(Math.min(...boxes.map(b=>viewport.worldHeight-b.top-b.size))/gridSize)*gridSize;
      if(minX>maxX || minY>maxY) return;
      drag.dx=Math.max(minX,Math.min(maxX,Math.round((p.x-drag.x)/gridSize)*gridSize));
      drag.dy=Math.max(minY,Math.min(maxY,Math.round((p.y-drag.y)/gridSize)*gridSize));
      const broadcast=performance.now()-lastBroadcast>=50;
      for(const t of drag.tokens) {
        useBattleMapStore.getState().updateTokenPosition(t.id,t.x+drag.dx,t.y+drag.dy);
        if(broadcast) move(t.id,t.x+drag.dx,t.y+drag.dy);
      }
      feedback.draw(drag.tokens,drag.dx,drag.dy);
      if(broadcast) lastBroadcast=performance.now();
    };
    const release=()=>{
      if(!drag) return;
      const held=drag; drag=null;feedback.clear();
      if(canvas.hasPointerCapture(held.pointer)) canvas.releasePointerCapture(held.pointer);
      suppressUntil=Date.now()+200;
      return held;
    };
    const cancel=()=>{
      const held=release(); if(!held || !current()) return;
      useBattleMapStore.getState().setDragging(null);
      for(const t of held.tokens) { useBattleMapStore.getState().updateTokenPosition(t.id,t.x,t.y);move(t.id,t.x,t.y); }
      end(held.tokens.map(t=>t.id));
    };
    const up=async(event:PointerEvent)=>{
      if(!drag || drag.pointer!==event.pointerId) return;
      preview(event);
      const held=release()!;
      if(!held.dx && !held.dy) {useBattleMapStore.getState().setDragging(null);end(held.tokens.map(t=>t.id));return;}
      busy.current=true;feedback.draw(held.tokens,held.dx,held.dy,true);
      try {
        const moves=held.tokens.map(t=>({id:t.id,from:{x:t.x,y:t.y},to:{x:t.x+held.dx,y:t.y+held.dy}}));
        const result=await commitTokenGroup(moves,campaignId,current,move);
        if(current() && result.saved.length) record(tokenMoveHistory(result.saved,campaignId));
        if(result.failed) showToast('Some tokens could not move. Saved moves can be undone.','error');
      } finally {
        if(current()) { useBattleMapStore.getState().setDragging(null);end(held.tokens.map(t=>t.id)); }
        busy.current=false;feedback.clear();
      }
    };
    const pointerCancel=(event:PointerEvent)=>{if(drag?.pointer===event.pointerId){swallow(event);cancel();}};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape' && drag){swallow(event);cancel();}};
    const click=(event:MouseEvent)=>{if(Date.now()<suppressUntil) swallow(event);};
    // Pixi already owns a capture listener on the canvas. Intercept on its
    // parent; MapNavigation captures at window level and retains Pan priority.
    const host=canvas.parentElement!;
    host.addEventListener('pointerdown',down,true);
    canvas.addEventListener('click',click,true);
    window.addEventListener('pointermove',preview,true);window.addEventListener('pointerup',up,true);
    window.addEventListener('pointercancel',pointerCancel,true);window.addEventListener('keydown',escape,true);window.addEventListener('blur',cancel);
    return ()=>{
      cancel();feedback.destroy();
      host.removeEventListener('pointerdown',down,true);canvas.removeEventListener('click',click,true);
      window.removeEventListener('pointermove',preview,true);window.removeEventListener('pointerup',up,true);
      window.removeEventListener('pointercancel',pointerCancel,true);window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel);
    };
  },[canvas,viewport,enabled,selectedIds,gridSize,campaignId,record,start,move,end,showToast]);
  return null;
}
