import {useLayoutEffect,useRef,useState} from 'react';

/** v2.715 — measure each submenu, not a guessed row count. Long menus
 * scroll inside the visible viewport, including landscape/keyboard resize. */
export function useMapMenuPosition(x:number,y:number,contentKey:string) {
  const ref=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:8,top:8});
  useLayoutEffect(()=>{
    const menu=ref.current;if(!menu)return;
    menu.scrollTop=0;
    const measure=()=>{
      const view=window.visualViewport;
      const width=view?.width??window.innerWidth,height=view?.height??window.innerHeight;
      const originX=view?.offsetLeft??0,originY=view?.offsetTop??0;
      menu.style.maxWidth=`${Math.max(0,width-16)}px`;
      menu.style.maxHeight=`${Math.max(0,height-16)}px`;
      const rect=menu.getBoundingClientRect();
      const next={left:Math.max(originX+8,Math.min(x,originX+width-rect.width-8)),top:Math.max(originY+8,Math.min(y,originY+height-rect.height-8))};
      setPosition(old=>old.left===next.left && old.top===next.top?old:next);
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(menu);
    window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
  },[x,y,contentKey]);
  return {ref,...position};
}
