import {applyDamageAffinities,type DamageModifier} from './damageAffinities';
import {readDamageComponents,type DamageComponentRecord} from './damageComponents';
import {sharpenedDamageReplacement,sharpenedIgnoresResistance,type SharpenedDamageSource} from './sharpenedMindDamage';
/** SRD 5.2.1 p.17: combine damage of the same type before its resistance;
 * modifiers precede resistance, then vulnerability. Different types stay apart.
 * This pure stage requires explicit adjustments; never infer them from a final
 * number that might already include a reaction or a DM override. */
export interface TypedDamageDefenses {immune:readonly string[];resistant:readonly string[];vulnerable:readonly string[];resistanceAll?:boolean}
export interface TypedDamageGroup {damageType:string|null;componentKeys:string[];raw:number;adjusted:number;final:number;modifier:DamageModifier;resistanceIgnored:boolean}
export interface TypedDamageResult {groups:TypedDamageGroup[];total:number;psychicDamage:number}
export interface TypedDamageAdjustment {multiplier?:1|0.5|0;resistantTypes?:readonly string[]}
const normalized=(s:string)=>s.trim().toLowerCase();
export function resolveTypedDamage(record:DamageComponentRecord,defenses:TypedDamageDefenses,adjustments:TypedDamageAdjustment={},
 sharpened:{active:boolean;sources:Readonly<Record<string,SharpenedDamageSource>>}={active:false,sources:{}}):TypedDamageResult {
 const packet=readDamageComponents(record);
 if(!packet||![defenses.immune,defenses.resistant,defenses.vulnerable,adjustments.resistantTypes??[]].every(a=>Array.isArray(a)&&a.every(t=>typeof t==='string'))
  ||![undefined,1,0.5,0].includes(adjustments.multiplier))throw new Error('Typed damage inputs could not be verified.');
 const matches=(values:readonly string[],type:string|null)=>type!==null&&values.some(v=>normalized(v)===type||normalized(v)==='all');
 const resisted=(type:string|null)=>!!defenses.resistanceAll||matches(defenses.resistant,type)||matches(adjustments.resistantTypes??[],type);
 const grouped=new Map<string,{type:string|null;keys:string[];amount:number;ignore:boolean}>();
 for(const c of packet.components){
  const ignore=!matches(defenses.immune,c.damageType)&&resisted(c.damageType)&&c.damageType!==null&&sharpenedIgnoresResistance(sharpened.active,c.damageType,sharpened.sources[c.key]??'unknown');
  // Only the qualifying source ignores resistance; an unrelated psychic rider
  // does not inherit a Psion spell's provenance just because their types match.
  const key=JSON.stringify([c.damageType,ignore]),old=grouped.get(key);
  if(old){old.amount+=c.rawTotal;if(!Number.isSafeInteger(old.amount))throw new Error('Damage exceeds the supported number range.');old.keys.push(c.key);}else grouped.set(key,{type:c.damageType,keys:[c.key],amount:c.rawTotal,ignore});
 }
 // A flattened half multiplier cannot say how rounding was allocated between
 // differently protected sources. Require that provenance before resolving HP.
 if(adjustments.multiplier===0.5){
  const types=new Set<string|null>();
  for(const g of grouped.values()){
   if(types.has(g.type))throw new Error('Mixed resistance bypass requires explicit adjustment allocation.');
   types.add(g.type);
  }
 }
 const groups=Array.from(grouped.values()).map(g=>{
  if(!Number.isSafeInteger(g.amount))throw new Error('Damage exceeds the supported number range.');
  const raw=Math.max(0,g.amount),adjusted=Math.floor(raw*(adjustments.multiplier??1));
  const immune=matches(defenses.immune,g.type),resistant=resisted(g.type);
  const affinity=applyDamageAffinities(adjusted,{immune,resistant,vulnerable:matches(defenses.vulnerable,g.type),ignoreResistance:g.ignore});
  if(!Number.isSafeInteger(affinity.final))throw new Error('Damage exceeds the supported number range.');
  return {damageType:g.type,componentKeys:g.keys,raw,adjusted,final:affinity.final,modifier:affinity.modifier,resistanceIgnored:g.ignore&&resistant&&!immune&&adjusted>0};
 });
 const total=groups.reduce((n,g)=>n+g.final,0),psychicDamage=groups.filter(g=>g.damageType==='psychic').reduce((n,g)=>n+g.final,0);
 if(!Number.isSafeInteger(total))throw new Error('Damage exceeds the supported number range.');
 return {groups,total,psychicDamage};
}

/** v2.868: preview one target's entire mixed damage packet before/after Attack
 * Mode. Keep original history untouched; only a real die in THIS packet can be
 * replaced. Caller still authorizes activation, current-turn use and sources. */
export function previewTypedSharpenedReplacement(record:DamageComponentRecord,defenses:TypedDamageDefenses,adjustments:TypedDamageAdjustment,
 sharpened:{active:boolean;usedThisTurn:boolean;recordedNumber:number;sources:Readonly<Record<string,SharpenedDamageSource>>},
 selection:{componentKey:string;dieIndex:number}) {
 const packet=readDamageComponents(record);
 if(!packet)throw new Error('Typed damage inputs could not be verified.');
 const before=resolveTypedDamage(packet,defenses,adjustments,sharpened);
 const component=packet.components.find(c=>c.key===selection.componentKey),index=selection.dieIndex;
 if(!component||!Number.isInteger(index)||index<0||index>=component.rolls.length)return null;
 const replacement=sharpenedDamageReplacement({...sharpened,psychicDamageDealt:before.psychicDamage>0,original:component.rolls[index],kind:component.dieKinds[index]});
 if(!replacement)return null;
 component.rolls[index]=replacement.replacement;
 component.dieKinds[index]='adjusted';
 component.rawTotal+=replacement.delta;
 const after=resolveTypedDamage(packet,defenses,adjustments,sharpened);
 return {before,after,components:packet,replacement:{...selection,...replacement}};
}
