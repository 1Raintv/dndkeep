/** Small SVGs stay sharp at every display density; no icon-font dependency. */
export function MapControlIcon({kind}:{kind:'select'|'pan'|'fit'|'focus'|'back'}) {
  const paths={
    back:'M9 5L3 11l6 6M3 11h11a6 6 0 016 6v2',
    select:'M5 3l14 9-7 1-3 7z',
    pan:'M8 12V6a2 2 0 014 0v5-7a2 2 0 014 0v7-4a2 2 0 014 0v8c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 013-2l2 2',
    fit:'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
    focus:'M12 3v3m0 12v3M3 12h3m12 0h3M18 12a6 6 0 11-12 0 6 6 0 0112 0',
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]}/></svg>;
}
