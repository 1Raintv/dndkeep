/** v2.858: SRD 5.2.1 pp.104-105 allows any level 1-8 spell to use a
 * higher slot. An extra scaling benefit is not a requirement. */
export function canUpcastSpell(spell:{level:number}):boolean {
 return Number.isInteger(spell.level)&&spell.level>=1&&spell.level<9;
}
export function availableSpellSlots(level:number,slots:Record<string,{total:number;used:number}>):{level:number;remaining:number}[]{
 if(!Number.isInteger(level)||level<1||level>9)return [];
 const available:{level:number;remaining:number}[]=[];
 for(let tier=level;tier<=9;tier++){
  const slot=slots[tier];
  if(slot&&Number.isInteger(slot.total)&&Number.isInteger(slot.used)&&slot.total>0&&slot.used>=0&&slot.used<slot.total)
   available.push({level:tier,remaining:slot.total-slot.used});
 }
 return available;
}
