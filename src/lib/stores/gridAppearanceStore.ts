import {create} from 'zustand';
import {DEFAULT_GRID_APPEARANCE,parseGridAppearance,type GridAppearance} from '../map/gridAppearance';
const KEY='dndkeep:grid-appearance';
function read():GridAppearance {try{return parseGridAppearance(JSON.parse(localStorage.getItem(KEY)??'null'));}catch{return {...DEFAULT_GRID_APPEARANCE};}}
/** v2.708 — personal display settings, deliberately never broadcast or persisted to a scene. */
export const useGridAppearance=create<GridAppearance & {setAppearance:(patch:Partial<GridAppearance>)=>void}>(set=>({
  ...read(),setAppearance:patch=>set(current=>{
    const next=parseGridAppearance({...current,...patch});
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* Storage may be disabled; the current view still works. */}
    return next;
  }),
}));
