/** v2.787 — keep the entire scrollable spell picker reachable, including
 * when its trigger sits near the bottom of a phone screen. */
export function spellPickerPosition(anchor:{left:number;bottom:number},viewport:{width:number;height:number}){
 const margin=12,width=Math.max(0,Math.min(480,viewport.width-2*margin));
 const maxHeight=Math.max(0,Math.min(500,viewport.height-2*margin));
 return {left:Math.max(margin,Math.min(anchor.left,viewport.width-width-margin)),
  top:Math.max(margin,Math.min(anchor.bottom+4,viewport.height-maxHeight-margin)),width,maxHeight};
}
