export interface OverlayBox {left:number;right:number;top:number;bottom:number}
export const boxesOverlap=(a:OverlayBox,b:OverlayBox)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
/** v2.861: only overlapping overlays consume map space. Coordinates are viewport
 * pixels, so an embedded map and a portaled action rail share the same frame. */
export function mapControlInsets(host:OverlayBox,bottom:readonly OverlayBox[],side:readonly OverlayBox[]){
 const visible=(b:OverlayBox)=>b.right>b.left&&b.bottom>b.top&&boxesOverlap(host,b);
 const right=Math.max(0,...side.filter(visible).map(b=>host.right-b.left+12));
 // Controls beside a rail do not need to rise over floating tools behind it.
 // DOMRect edges are prototype getters; object spread silently drops them.
 const clear={left:host.left,top:host.top,bottom:host.bottom,right:host.right-right};
 return {bottom:Math.max(0,...bottom.filter(b=>visible(b)&&boxesOverlap(clear,b)).map(b=>host.bottom-b.top+12)),right};
}
