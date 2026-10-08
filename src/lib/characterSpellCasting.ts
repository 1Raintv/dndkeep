import type {Character,ComputedStats,SpellData} from '../types';
import {classCastingAbility,classSpellCastingOptions,spellCastingNumbers,type CastingAbility} from '../rules/spellCasting';
/** v2.794 — bridge persisted ownership to effective sheet modifiers. Does not
 * change ownership/preparation or replace the stored character's class identity. */
export function characterSpellCasting(character:Character,spell:Pick<SpellData,'id'|'level'>,computed:ComputedStats){
 const primary={name:character.class_name,level:character.level,ability:classCastingAbility(character.class_name,character.subclass,character.level)};
 const secondary=character.secondary_class?{name:character.secondary_class,level:character.secondary_level??0,ability:classCastingAbility(character.secondary_class,character.secondary_subclass,character.secondary_level??0)}:null;
 const result=classSpellCastingOptions({id:spell.id,spellLevel:spell.level,classes:[primary,...(secondary&&secondary.level!==0?[secondary]:[])],sources:character.spell_sources??{},preparationSources:character.spell_preparation_sources??{},prepared:Array.isArray(character.prepared_spells)?character.prepared_spells:[]});
 const featureOptions=result.unresolvedSources.filter(source=>['species','grant:species','feat','other'].includes(source)).flatMap(source=>(['intelligence','wisdom','charisma'] as CastingAbility[]).map(ability=>({source,className:null,ability,key:`${source}:${ability}`,label:source==='grant:species'?'Species':source[0].toUpperCase()+source.slice(1)})));
 const choices=[...result.options.map(option=>({...option,key:option.className,label:option.className})),...featureOptions];
 return {...result,options:choices.flatMap(option=>{
  const numbers=spellCastingNumbers(option.ability,computed.modifiers,computed.proficiency_bonus);
  return numbers?[{...option,...numbers}]:[];
 })};
}
