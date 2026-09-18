export interface GridAppearance {opacity:number;palette:'classic'|'light'|'dark';majorLines:boolean}
export const DEFAULT_GRID_APPEARANCE:GridAppearance={opacity:1,palette:'classic',majorLines:true};
/** v2.708 — local preferences must not let corrupt storage hide or break the map. */
export function parseGridAppearance(value:unknown):GridAppearance {
  const v=(value && typeof value==='object' ? value : {}) as Partial<GridAppearance>;
  return {opacity:typeof v.opacity==='number' && Number.isFinite(v.opacity) ? Math.min(1,Math.max(0,v.opacity)) : 1,
    palette:v.palette==='light'||v.palette==='dark' ? v.palette : 'classic',
    majorLines:typeof v.majorLines==='boolean' ? v.majorLines : true};
}
export function gridColors(palette:GridAppearance['palette']) {
  if(palette==='light')return {minor:0xe2e8f0,major:0xffffff,edge:0xcbd5e1};
  if(palette==='dark')return {minor:0x111827,major:0x030712,edge:0x111827};
  return {minor:0x2a2d31,major:0x404449,edge:0x6b7280};
}
