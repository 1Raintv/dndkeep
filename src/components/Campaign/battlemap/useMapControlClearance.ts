import { useEffect, type RefObject } from 'react';

/** v2.701 — combat controls wrap and raise the dice buttons. Measure their
 * bounds so navigation and history stay reachable on phones and in fullscreen. */
export function useMapControlClearance(ref:RefObject<HTMLDivElement|null>, avoidFloatingControls=true, mounted=true) {
  useEffect(()=>{
    const nav=ref.current;if(!nav) return;
    let observed:Element[]=[];let frame=0;
    const update=()=>{
      frame=0;
      const parent=nav.offsetParent as HTMLElement|null;
      const obstacles=[...document.querySelectorAll('.initiative-strip'),
        ...(avoidFloatingControls?[...document.querySelectorAll('.quickroll-fab,.rolllog-fab'),...parent?.querySelectorAll('.party-vitals')??[]]:[])]
        .filter(element=>element!==nav);
      for(const old of observed)if(!obstacles.includes(old))resize.unobserve(old);
      for(const next of obstacles)if(!observed.includes(next))resize.observe(next);
      if(obstacles.some(element=>!observed.includes(element))||observed.some(element=>!obstacles.includes(element))) {
        positions.disconnect();for(const element of obstacles)positions.observe(element,{attributes:true,attributeFilter:['style','class']});
      }
      observed=obstacles;
      const boxes=obstacles.map(element=>element.getBoundingClientRect()).filter(box=>box.height>0);
      const clearance=parent ? Math.max(0,...boxes.map(box=>parent.getBoundingClientRect().bottom-box.top+12)) : 0;
      const value=`${clearance}px`;
      if(nav.style.getPropertyValue('--map-combat-clearance')!==value) nav.style.setProperty('--map-combat-clearance',value);
    };
    const schedule=()=>{if(!frame) frame=requestAnimationFrame(update);};
    const resize=new ResizeObserver(schedule);
    const positions=new MutationObserver(schedule);
    if(nav.parentElement) resize.observe(nav.parentElement);
    const mutations=new MutationObserver(schedule);
    mutations.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
    // Dice buttons animate to their combat position after the strip mounts.
    document.addEventListener('transitionend',schedule,true);
    update();
    return ()=>{resize.disconnect();positions.disconnect();mutations.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);document.removeEventListener('transitionend',schedule,true);};
  },[ref,avoidFloatingControls,mounted]);
}
