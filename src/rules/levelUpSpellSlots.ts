/** v2.769 — changing slot capacity is not a rest. Preserve expenditure. */
export function levelUpSpellSlots(current:Record<string,{total:number;used:number}>,row:readonly number[]) {
 const slots:Record<string,{total:number;used:number}>={};
 row.forEach((total,index)=>{
  if(total>0){const key=String(index+1);slots[key]={total,used:Math.min(current[key]?.used??0,total)};}
 });
 return slots;
}
