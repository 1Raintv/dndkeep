import {useEffect,useRef} from 'react';

/** v2.702 — instructions are available on demand instead of covering the map. */
export function MapHelp() {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(ref.current && !ref.current.contains(event.target as Node)) ref.current.open=false;};
    document.addEventListener('pointerdown',close);
    return ()=>document.removeEventListener('pointerdown',close);
  },[]);
  return <details ref={ref} className="map-help" onKeyDown={event=>{
    if(event.key==='Escape') {event.stopPropagation();ref.current!.open=false;ref.current!.querySelector('summary')?.focus();}
  }}>
    <summary aria-label="Map controls"><span aria-hidden="true">?</span></summary>
    <div className="map-help-panel" role="region" aria-label="Map controls help">
      <strong>Map controls</strong>
      <p>Use Select to move tokens. Switch to Pan to explore without moving them.</p>
      <dl>
        <dt>Pan temporarily</dt><dd>Hold <kbd>Space</kbd> and drag</dd>
        <dt>Zoom</dt><dd>Scroll, or pinch in Pan mode</dd>
        <dt>Select a group</dt><dd><kbd>Shift</kbd> + click tokens (DM)</dd>
        <dt>Token options</dt><dd>Right-click a token</dd>
        <dt>Undo / redo</dt><dd><kbd>Ctrl / ⌘ Z</kbd> · add <kbd>Shift</kbd> to redo</dd>
        <dt>Cancel</dt><dd><kbd>Esc</kbd></dd>
      </dl>
    </div>
  </details>;
}
