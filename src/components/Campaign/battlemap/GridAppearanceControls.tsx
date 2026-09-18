import {useGridAppearance} from '../../../lib/stores/gridAppearanceStore';
import {DEFAULT_GRID_APPEARANCE,type GridAppearance} from '../../../lib/map/gridAppearance';
import './GridAppearanceControls.css';

export function GridAppearanceControls() {
  const {opacity,palette,majorLines,setAppearance}=useGridAppearance();
  return <fieldset className="grid-appearance">
    <legend>Grid appearance</legend>
    <label>Color<select aria-label="Grid color" value={palette} onChange={e=>setAppearance({palette:e.target.value as GridAppearance['palette']})}>
      <option value="classic">Classic</option><option value="light">Light — dark artwork</option><option value="dark">Dark — light artwork</option>
    </select></label>
    <label>Opacity <output>{Math.round(opacity*100)}%</output><input aria-label="Grid opacity" type="range" min="0" max="100" value={Math.round(opacity*100)} onChange={e=>setAppearance({opacity:Number(e.target.value)/100})}/></label>
    <label className="grid-major-toggle"><input type="checkbox" checked={majorLines} onChange={e=>setAppearance({majorLines:e.target.checked})}/> Stronger lines every 5 cells</label>
    <button type="button" onClick={()=>setAppearance(DEFAULT_GRID_APPEARANCE)}>Reset grid appearance</button>
    <p>Saved on this device. Only your view changes; snapping stays the same.</p>
  </fieldset>;
}
