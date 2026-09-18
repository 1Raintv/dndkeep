export type ArtworkFit = 'contain' | 'cover';

/** v2.707 — one transform for preview and stored artwork. Never stretch axes
 * independently; preserve scene coordinates and add padding or crop instead. */
export function artworkLayout(iw:number,ih:number,width:number,height:number,fit:ArtworkFit) {
  if (![iw,ih,width,height].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid image dimensions');
  const scale=(fit==='contain' ? Math.min : Math.max)(width/iw,height/ih);
  return {x:(width-iw*scale)/2,y:(height-ih*scale)/2,width:iw*scale,height:ih*scale,scale};
}

export function artworkRaster(width:number,height:number) {
  if (![width,height].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid map dimensions');
  const scale=Math.min(1,4096/width,4096/height,Math.sqrt(8_000_000/(width*height)));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
