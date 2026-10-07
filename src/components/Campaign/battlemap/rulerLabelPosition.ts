/** v2.778 — screen-space label placement: prefer below the endpoint, flip
 * above near the bottom, then keep the whole measured text inside the canvas. */
export function rulerLabelPosition(tip:{x:number;y:number},size:{width:number;height:number},view:{width:number;height:number}) {
 const padding=6,gap=14;
 const fit=(start:number,length:number,available:number)=>length>available-2*padding
  ? (available-length)/2 : Math.max(padding,Math.min(start,available-padding-length));
 const below=tip.y+gap;
 const top=below+size.height>view.height-padding?tip.y-gap-size.height:below;
 return {x:fit(tip.x-size.width/2,size.width,view.width),y:fit(top,size.height,view.height)};
}
