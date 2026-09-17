import type { Token } from '../../../lib/map/mapTypes';
import { tokenBoundsWorld } from './marqueeGeometry';

/** v2.705 — centre the full footprint union, not an average biased toward
 * clusters. Zoom out only as needed, leaving 10% breathing room on each side. */
export function selectionFrame(tokens: Token[], gridSize: number, width: number, height: number, currentZoom: number,
  area={left:0,top:0,right:width,bottom:height}) {
  if (!tokens.length || width <= 0 || height <= 0 || gridSize <= 0 || currentZoom <= 0) return null;
  if(area.right<=area.left || area.bottom<=area.top) return null;
  const bounds=tokens.map(t=>tokenBoundsWorld(t,gridSize));
  const left=Math.min(...bounds.map(b=>b.x1)), right=Math.max(...bounds.map(b=>b.x2));
  const top=Math.min(...bounds.map(b=>b.y1)), bottom=Math.max(...bounds.map(b=>b.y2));
  const zoom=Math.min(currentZoom,(area.right-area.left)*.8/(right-left),(area.bottom-area.top)*.8/(bottom-top));
  // The camera centres the canvas; offset it so the selection centres in the
  // unobstructed region instead (tool rail left, action bar above, dock below).
  return {x:(left+right)/2+(width-area.left-area.right)/2/zoom,
    y:(top+bottom)/2+(height-area.top-area.bottom)/2/zoom,zoom};
}
