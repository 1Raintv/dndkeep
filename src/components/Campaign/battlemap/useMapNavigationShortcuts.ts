import {useEffect,useRef} from 'react';

/** v2.714 — camera shortcuts belong to the unobstructed map, never a form
 * or an in-progress pointer gesture. Buttons remain the keyboard-only path. */
export function useMapNavigationShortcuts(canvas:HTMLCanvasElement|null, actions:{zoom:(factor:number)=>void;fit:()=>void;focus?:()=>void;previous?:()=>void}) {
  const latest=useRef(actions);latest.current=actions;
  useEffect(()=>{
    if(!canvas)return;
    let pointer:{x:number;y:number}|null=null;
    // v2.869: one released finger (or a hovering mouse) must not unlock
    // camera shortcuts while another pointer still owns a gesture.
    const pressed=new Set<number>();
    const buttons=(event:PointerEvent)=>{if(event.buttons!==0)pressed.add(event.pointerId);else pressed.delete(event.pointerId);};
    const move=(event:PointerEvent)=>{pointer={x:event.clientX,y:event.clientY};buttons(event);};
    const leave=()=>{pointer=null;};
    const down=(event:PointerEvent)=>{pressed.add(event.pointerId);};
    const up=(event:PointerEvent)=>{buttons(event);};
    const cancel=(event:PointerEvent)=>{pointer=null;pressed.delete(event.pointerId);};
    const reset=()=>{pointer=null;pressed.clear();};
    const hidden=()=>{if(document.visibilityState==='hidden')reset();};
    const key=(event:KeyboardEvent)=>{
      if(!pointer || pressed.size>0 || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)return;
      if(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]'))return;
      // v2.741 — a dialog owns keys even before focus settles or away from its bounds.
      if([...document.querySelectorAll('[aria-modal="true"],dialog[open]')].some(el=>el.getClientRects().length>0))return;
      // Hit-test at key time: a newly opened overlay must not leave stale hover ownership.
      if(document.elementFromPoint(pointer.x,pointer.y)!==canvas)return;
      if(event.key==='+' || event.key==='=') {event.preventDefault();latest.current.zoom(1.2);}
      else if(event.key==='-') {event.preventDefault();latest.current.zoom(1/1.2);}
      else if(event.key==='0') {event.preventDefault();if(!event.repeat)latest.current.fit();}
      // v2.724 — reuse the same selection framing as the visible button.
      else if(event.key.toLowerCase()==='f' && latest.current.focus) {event.preventDefault();if(!event.repeat)latest.current.focus();}
      // v2.737 — camera return is separate from shared token undo.
      else if(event.key.toLowerCase()==='r' && latest.current.previous) {event.preventDefault();if(!event.repeat)latest.current.previous();}
    };
    canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);
    window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);
    window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',reset);
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('keydown',key);
    return ()=>{
      canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);
      window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);
      window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('blur',reset);
      document.removeEventListener('visibilitychange',hidden);
      window.removeEventListener('keydown',key);
    };
  },[canvas]);
}
