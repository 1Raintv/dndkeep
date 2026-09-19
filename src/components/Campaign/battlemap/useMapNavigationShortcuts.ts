import {useEffect,useRef} from 'react';

/** v2.714 — camera shortcuts belong to the unobstructed map, never a form
 * or an in-progress pointer gesture. Buttons remain the keyboard-only path. */
export function useMapNavigationShortcuts(canvas:HTMLCanvasElement|null, actions:{zoom:(factor:number)=>void;fit:()=>void;focus?:()=>void;previous?:()=>void}) {
  const latest=useRef(actions);latest.current=actions;
  useEffect(()=>{
    if(!canvas)return;
    let pointer:{x:number;y:number}|null=null,pressed=false;
    const move=(event:PointerEvent)=>{pointer={x:event.clientX,y:event.clientY};pressed=event.buttons!==0;};
    const leave=()=>{pointer=null;};
    const down=()=>{pressed=true;};
    const up=(event:PointerEvent)=>{pressed=event.buttons!==0;};
    const reset=()=>{pointer=null;pressed=false;};
    const key=(event:KeyboardEvent)=>{
      if(!pointer || pressed || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)return;
      if(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]'))return;
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
    window.addEventListener('pointercancel',reset,true);window.addEventListener('blur',reset);
    window.addEventListener('keydown',key);
    return ()=>{
      canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);
      window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);
      window.removeEventListener('pointercancel',reset,true);window.removeEventListener('blur',reset);
      window.removeEventListener('keydown',key);
    };
  },[canvas]);
}
