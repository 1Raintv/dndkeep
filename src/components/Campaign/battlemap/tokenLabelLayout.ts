export interface LabelBox {id:string;x:number;y:number;width:number;height:number;priority:number}
const overlaps=(a:LabelBox,b:LabelBox)=>a.x<b.x+b.width+3 && a.x+a.width+3>b.x && a.y<b.y+b.height+3 && a.y+a.height+3>b.y;
/** v2.721 — keep state indicators unobscured; stable priority avoids flicker.
 * Selected/active names win name collisions, but never cover token state. */
export function visibleTokenNames(names:LabelBox[],obstacles:LabelBox[]):Set<string>{
  const kept:LabelBox[]=[];
  for(const name of [...names].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
    if(obstacles.some(o=>overlaps(name,o)) || kept.some(o=>overlaps(name,o)))continue;
    kept.push(name);
  }
  return new Set(kept.map(n=>n.id));
}
