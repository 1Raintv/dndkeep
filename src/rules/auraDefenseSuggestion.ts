import {DAMAGE_TYPES,applyDamageAffinities} from './damageAffinities';
import {speciesResistances} from './speciesResistances';
import type {ReviewedAuraInputs} from './prepareAuraProposal';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** v2.869: suggest only from the saved damage context, including timed Stony.
 * Unknown/qualified defenses stay manual. This never approves the DM review. */
export function auraDefenseSuggestion(context:unknown):ReviewedAuraInputs['affinity']|null {
 if(!object(context)||!object(context.aura)||!object(context.aura.aura)||!object(context.target))return null;
 const spec=context.aura.aura,target=context.target;
 if(spec.damageDice===null)return 'normal';
 if(typeof spec.damageDice!=='string')return null;
 if(typeof spec.damageType!=='string'||!DAMAGE_TYPES.includes(spec.damageType.trim().toLowerCase() as typeof DAMAGE_TYPES[number]))return null;
 const type=spec.damageType.trim().toLowerCase();
 if(!object(target.definition)||!object(target.combatant)||!object(target.participant))return null;
 const definition=target.definition,combatant=target.combatant,character=target.participant.participant_type==='character';
 if(!['character','creature','monster','npc'].includes(String(target.participant.participant_type)))return null;
 if(!['damage_resistances','damage_immunities','damage_vulnerabilities'].every(key=>key in definition))return null;
 const list=(value:unknown,nullable=false):string[]|null=>{
  if(value==null&&nullable)return [];
  if(!Array.isArray(value)||!value.every(v=>typeof v==='string'&&DAMAGE_TYPES.includes(v.trim().toLowerCase() as typeof DAMAGE_TYPES[number])))return null;
  return value.map(v=>v.trim().toLowerCase());
 };
 const resistant=list(definition.damage_resistances,character),immune=list(definition.damage_immunities,character),vulnerable=list(definition.damage_vulnerabilities,character);
 if(!resistant||!immune||!vulnerable)return null;
 if(character){
  if(typeof definition.species!=='string')return null;
  const choices=definition.species_choices;
  if(choices!=null&&(!object(choices)||!Object.values(choices).every(v=>typeof v==='string')))return null;
  // Missing legacy cannot establish that a Tiefling has no resistance.
  if(definition.species.trim().toLowerCase()==='tiefling'&&(!object(choices)||!['abyssal','chthonic','infernal'].includes(String(choices.tieflingLegacy))))return null;
  resistant.push(...speciesResistances(definition.species,choices as Record<string,string>|null));
 }
 for(const value of [combatant.active_buffs,...(character?[definition.active_buffs]:[])]){
  if(value==null)continue;
  if(!Array.isArray(value))return null;
  for(const buff of value){
   if(!object(buff))return null;
   for(const [key,into] of [['resistances',resistant],['immunities',immune]] as const){
    if(buff[key]==null)continue;const types=list(buff[key]);if(!types)return null;into.push(...types);
   }
  }
 }
 const conditions=combatant.active_conditions;
 if(conditions!=null&&(!Array.isArray(conditions)||!conditions.every(v=>typeof v==='string')))return null;
 const modifier=applyDamageAffinities(2,{immune:immune.includes(type),resistant:resistant.includes(type)||(Array.isArray(conditions)&&conditions.includes('Petrified')),vulnerable:vulnerable.includes(type)}).modifier;
 return modifier==='none'?'normal':modifier;
}
