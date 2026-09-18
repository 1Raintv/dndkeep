import {useEffect,useRef,type ReactNode} from 'react';

/** v2.712 — lower tools must scroll above the navigation dock, including combat. */
export function MapToolPalette({children}:{children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const rail=ref.current!,host=rail.parentElement!;
    const nav=host.querySelector('.map-navigation');
    let frame=0;
    const measure=()=>{
      frame=0;const top=rail.getBoundingClientRect().top;
      const bottom=Math.min(host.getBoundingClientRect().bottom,nav?.getBoundingClientRect().top??Infinity);
      rail.style.maxHeight=`${Math.max(0,bottom-top-12)}px`;
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule);resize.observe(host);if(nav)resize.observe(nav);
    const position=new MutationObserver(schedule);if(nav)position.observe(nav,{attributes:true,attributeFilter:['style']});
    window.addEventListener('resize',schedule);measure();
    return ()=>{resize.disconnect();position.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);};
  },[]);
  return <div ref={ref} className="map-tool-palette" role="toolbar" aria-label="Map tools" aria-orientation="vertical" style={{
    position:'absolute',top:60,left:12,maxHeight:'calc(100% - 230px)',overflowY:'auto',boxSizing:'border-box',
    display:'flex',flexDirection:'column',alignItems:'center',gap:4,padding:'6px 5px',
    background:'rgba(15,16,18,0.92)',border:'1px solid var(--c-border)',borderRadius:'var(--r-md, 8px)',
    boxShadow:'0 4px 12px rgba(0,0,0,0.5)',zIndex:5,
  }}>{children}</div>;
}
