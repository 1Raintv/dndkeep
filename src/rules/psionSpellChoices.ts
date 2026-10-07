import {isSpellSources,type SpellSource,type SpellSources} from './spellSources';
export type {SpellSource,SpellSources} from './spellSources';
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


type PsionSwapInput = Parameters<typeof replacePsionLevelUpSpells>[0];

/** A spell can be learned independently through multiple classes/features.
 * Missing entries are unknown, not evidence that a spell belongs to Psion.
 * The existing rule still owns level/category/list/grant validation. */
export function replaceOwnedPsionLevelUpSpells(input:PsionSwapInput & {sources:SpellSources}):
 | {ok:true;known:string[];prepared:string[];sources:SpellSources}
 | {ok:false;reason:string} {
 if(!isSpellSources(input.sources))return {ok:false,reason:'Spell sources could not be read. Correct the saved source data before replacing spells.'};
 const owner:SpellSource='class:Psion';
 for(const swap of [input.swaps.cantrip,input.swaps.spell]){
  if(!swap)continue;
  if(!input.sources[swap.from]?.includes(owner))
   return {ok:false,reason:'Confirm that the spell you are replacing was learned through Psion.'};
  if(input.known.includes(swap.to)&&!input.sources[swap.to]?.length)
   return {ok:false,reason:'Review the existing spell’s sources before choosing it for Psion.'};
 }
 const owned=input.known.filter(id=>input.sources[id]?.includes(owner));
 const result=replacePsionLevelUpSpells({...input,known:owned,prepared:input.prepared.filter(id=>owned.includes(id))});
 if(!result.ok)return result;
 const sources:SpellSources=Object.fromEntries(Object.entries(input.sources).map(([id,owners])=>[id,[...owners]]));
 const known=new Set(input.known),prepared=new Set(input.prepared);
 for(const kind of ['cantrip','spell'] as const){
  const swap=input.swaps[kind];if(!swap)continue;
  const remaining=[...new Set(sources[swap.from].filter(source=>source!==owner))];
  if(remaining.length)sources[swap.from]=remaining;
  else {delete sources[swap.from];known.delete(swap.from);prepared.delete(swap.from);}
  sources[swap.to]=[...new Set([...(sources[swap.to]??[]),owner])];
  known.add(swap.to);if(kind==='spell')prepared.add(swap.to);
 }
 return {ok:true,known:[...known],prepared:[...prepared],sources};
}
