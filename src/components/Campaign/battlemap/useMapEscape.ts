import {useEffect,useRef} from 'react';

/** v2.869 — Escape belongs to a form or modal before the map underneath it. */
export function useMapEscape(onEscape:()=>void){
 const latest=useRef(onEscape);latest.current=onEscape;
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented||event.isComposing)return;
   if(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]'))return;
   if([...document.querySelectorAll('[aria-modal="true"],dialog[open]')].some(el=>el.getClientRects().length>0))return;
   latest.current();
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[]);
}
