import { useEffect, type RefObject } from 'react';

/** v2.701 — combat controls wrap and raise the dice buttons. Measure their
 * bounds so navigation and history stay reachable on phones and in fullscreen. */
export function useMapControlClearance(ref:RefObject<HTMLDivElement|null>) {
  useEffect(()=>{
    const nav=ref.current;if(!nav) return;
    let strip:Element|null=null, frame=0;
    const update=()=>{
      frame=0;
      const next=document.querySelector('.initiative-strip');
      if(next!==strip) {if(strip) resize.unobserve(strip);strip=next;if(strip) resize.observe(strip);}
      const parent=nav.offsetParent as HTMLElement|null;
      const boxes=[strip,...document.querySelectorAll('.quickroll-fab,.rolllog-fab')]
        .filter((element):element is Element=>!!element).map(element=>element.getBoundingClientRect()).filter(box=>box.height>0);
      const clearance=parent ? Math.max(0,...boxes.map(box=>parent.getBoundingClientRect().bottom-box.top+12)) : 0;
      const value=`${clearance}px`;
      if(nav.style.getPropertyValue('--map-combat-clearance')!==value) nav.style.setProperty('--map-combat-clearance',value);
    };
    const schedule=()=>{if(!frame) frame=requestAnimationFrame(update);};
    const resize=new ResizeObserver(schedule);
    if(nav.parentElement) resize.observe(nav.parentElement);
    const mutations=new MutationObserver(schedule);
    mutations.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
    // Dice buttons animate to their combat position after the strip mounts.
    document.addEventListener('transitionend',schedule,true);
    update();
    return ()=>{resize.disconnect();mutations.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);document.removeEventListener('transitionend',schedule,true);};
  },[ref]);
}
