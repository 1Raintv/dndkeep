import {useLayoutEffect,type RefObject} from 'react';
/** v2.853: wrapped combat controls have no fixed height. Publish the actual
 * occupied bottom edge so floating tools clear both the strip and phone nav. */
export function useBottomOverlayInset(ref:RefObject<HTMLElement|null>,active:boolean){
 useLayoutEffect(()=>{
  const node=ref.current;if(!active||!node)return;
  const style=document.body.style,key='--combat-strip-inset';let last='',frame=0;
  const measure=()=>{frame=0;last=`${Math.max(0,Math.ceil(window.innerHeight-node.getBoundingClientRect().top))}px`;if(style.getPropertyValue(key)!==last)style.setProperty(key,last);};
  // v2.861: changing the shared inset resizes other observed overlays. Defer
  // it out of ResizeObserver delivery to avoid a same-frame notification loop.
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  measure();const observer=new ResizeObserver(schedule);observer.observe(node);window.addEventListener('resize',schedule);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);if(style.getPropertyValue(key)===last)style.removeProperty(key);};
 },[ref,active]);
}
