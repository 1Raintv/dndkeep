import {useEffect,useRef} from 'react';
import {GridAppearanceControls} from './GridAppearanceControls';

/** v2.702 — instructions are available on demand instead of covering the map. */
export function MapHelp() {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const details=ref.current!;
    const nav=details.closest('.map-navigation')!;
    // v2.704 — a landscape combat dock can sit high on the screen. Size
    // help to the actual room above it, keeping all instructions scrollable.
    const measure=()=>{if(details.open) details.style.setProperty('--map-help-space',`${Math.max(0,nav.getBoundingClientRect().top-18)}px`);};
    const resize=new ResizeObserver(measure);resize.observe(nav);
    if(nav.parentElement) resize.observe(nav.parentElement);
    const position=new MutationObserver(measure);position.observe(nav,{attributes:true,attributeFilter:['style']});
    details.addEventListener('toggle',measure);
    window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
    const close=(event:PointerEvent)=>{if(ref.current && !ref.current.contains(event.target as Node)) ref.current.open=false;};
    document.addEventListener('pointerdown',close);
    return ()=>{document.removeEventListener('pointerdown',close);details.removeEventListener('toggle',measure);resize.disconnect();position.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
  },[]);
  return <details ref={ref} className="map-help" onKeyDown={event=>{
    if(event.key==='Escape') {event.stopPropagation();ref.current!.open=false;ref.current!.querySelector('summary')?.focus();}
  }}>
    <summary aria-label="Map controls" title="Map controls and grid appearance"><span aria-hidden="true">?</span></summary>
    <div className="map-help-panel" role="region" aria-label="Map controls help">
      <strong>Map controls</strong>
      <p>Use Select to move tokens. Switch to Pan to explore without moving them.</p>
      <dl>
        <dt>Pan temporarily</dt><dd>Hold <kbd>Space</kbd> and drag</dd>
        <dt>Zoom</dt><dd>Scroll, or pinch in Pan mode</dd>
        <dt>Zoom keys</dt><dd><kbd>+</kbd> / <kbd>−</kbd> over the map</dd>
        <dt>Fit map</dt><dd><kbd>0</kbd> over the map</dd>
        <dt>Find selection</dt><dd><kbd>F</kbd> over the map</dd>
        <dt>Select a group</dt><dd><kbd>Shift</kbd> + click tokens (DM)</dd>
        <dt>Token options</dt><dd>Right-click a token</dd>
        <dt>Undo / redo</dt><dd><kbd>Ctrl / ⌘ Z</kbd> · add <kbd>Shift</kbd> to redo</dd>
        <dt>Cancel</dt><dd><kbd>Esc</kbd></dd>
      </dl>
      {/* v2.725 — shortcuts come first; personal styling stays available on demand. */}
      <details className="map-appearance-section">
        <summary>Grid appearance</summary>
        <GridAppearanceControls/>
      </details>
    </div>
  </details>;
}
