import type {CSSProperties} from 'react';
import './MapToolButton.css';

const paths={
  ruler:'M4 8h16v8H4z M8 8v4m4-4v3m4-3v4',
  fog:'M6 17a4 4 0 010-8 6 6 0 0111-1 4.5 4.5 0 011 9z',
  walls:'M3 5h18v14H3z M3 12h18M9 5v7m6 0v7',
  clearWalls:'M3 5h18v7M3 5v14h8M3 12h8M9 5v7m7 3 5 6m0-6-5 6',
  view:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 11-6 0 3 3 0 016 0',
  text:'M5 5h14M12 5v15M8 20h8M5 5v3m14-3v3',
  pencil:'m4 16 11-11 4 4L8 20H4z M13 7l4 4',
  line:'M4 20 20 4',rect:'M4 6h16v12H4z',
  circle:'M20 12a8 8 0 11-16 0 8 8 0 0116 0',
  eraser:'m3 14 10-10 8 8-8 8H9z M8 9l8 8M13 20h8',
  clearDrawings:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  fire:'M12 3c1 5 6 6 6 11a6 6 0 01-12 0c0-3 2-5 3-6 0 3 1 4 2 4 2-3 1-6 1-9z',
  lightning:'M13 2 5 14h6l-1 8 9-13h-6z',
  sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  smoke:'M5 20c-4-5 6-4 2-9m5 9c-4-7 6-5 2-12m5 11c-4-5 4-7 0-15',
};
type Icon=keyof typeof paths;
/** v2.712 — consistent vector tools, without glyph/font differences across devices. */
export function MapToolButton({icon,label,title,active,onClick,tone='167,139,250'}:{
  icon:Icon;label:string;title:string;active?:boolean;onClick:()=>void;tone?:string;
}) {
  return <button type="button" className="map-tool-button" aria-label={label} title={title}
    aria-pressed={active} onClick={onClick} style={{'--tool-tone':tone} as CSSProperties}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[icon]}/></svg>
  </button>;
}
