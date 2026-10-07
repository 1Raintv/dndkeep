/** UA Psion Update pp.2–3: spell choices use Psion progression, not
 * multiclass slot totals or manually edited slot counters. */
export function maximumPsionSpellLevel(level:number):number {
 return Number.isInteger(level)&&level>=1&&level<=20?Math.min(9,Math.ceil(level/2)):0;
}

export interface PsionSpellChoice { id:string; level:number; classes:readonly string[] }
export interface PsionSpellSwap { from:string; to:string }
export interface PsionLevelUpSwaps { cantrip?:PsionSpellSwap; spell?:PsionSpellSwap }

/** v2.787 — UA Psion Update p.3: one optional replacement in each category
 * when gaining a Psion level. Grants cannot be traded for class choices.
 * Slot totals are intentionally absent: multiclass slots do not unlock choices. */
export function replacePsionLevelUpSpells(input:{
 currentLevel:number;newLevel:number;known:readonly string[];prepared:readonly string[];
 granted:readonly string[];catalog:readonly PsionSpellChoice[];swaps:PsionLevelUpSwaps;
}):{ok:true;known:string[];prepared:string[]}|{ok:false;reason:string} {
 if(!Number.isInteger(input.currentLevel)||input.currentLevel<1||input.currentLevel>=20||input.newLevel!==input.currentLevel+1)
  return {ok:false,reason:'Replace spells when gaining a Psion level.'};
 const catalog=new Map(input.catalog.map(s=>[s.id,s]));
 const known=new Set(input.known),prepared=new Set(input.prepared),granted=new Set(input.granted);
 for(const kind of ['cantrip','spell'] as const){
  const swap=input.swaps[kind];if(!swap)continue;
  const before=catalog.get(swap.from),after=catalog.get(swap.to);
  if(!before||!known.has(swap.from)||granted.has(swap.from)||!before.classes.includes('Psion'))
   return {ok:false,reason:'Choose one of your learned Psion spells to replace.'};
  if(!after||!after.classes.includes('Psion')||granted.has(swap.to)||known.has(swap.to))
   return {ok:false,reason:'Choose a different Psion spell you do not already have.'};
  if((before.level===0)!==(kind==='cantrip')||(after.level===0)!==(kind==='cantrip'))
   return {ok:false,reason:'Replace a cantrip with a cantrip, or a leveled spell with a leveled spell.'};
  if(!Number.isInteger(after.level)||after.level<0||after.level>maximumPsionSpellLevel(input.newLevel))
   return {ok:false,reason:'Choose a spell available at your new Psion level.'};
  known.delete(swap.from);known.add(swap.to);prepared.delete(swap.from);
  // A Psion's chosen leveled spells are its prepared list, not a spellbook.
  if(kind==='spell')prepared.add(swap.to);
 }
 return {ok:true,known:[...known],prepared:[...prepared]};
}
