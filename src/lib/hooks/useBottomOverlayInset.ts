import {useLayoutEffect,type RefObject} from 'react';
/** v2.853: wrapped combat controls have no fixed height. Publish the actual
 * occupied bottom edge so floating tools clear both the strip and phone nav. */
export function useBottomOverlayInset(ref:RefObject<HTMLElement|null>,active:boolean){
 useLayoutEffect(()=>{
  const node=ref.current;if(!active||!node)return;
  const style=document.body.style,key='--combat-strip-inset';let last='';
  const measure=()=>{last=`${Math.max(0,Math.ceil(window.innerHeight-node.getBoundingClientRect().top))}px`;style.setProperty(key,last);};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);if(style.getPropertyValue(key)===last)style.removeProperty(key);};
 },[ref,active]);
}
