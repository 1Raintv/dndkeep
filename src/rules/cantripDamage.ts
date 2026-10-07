import {isSpellSources} from './spellSources';

interface Caster {
 level:number;class_name:string;subclass?:string|null;
 secondary_class?:string|null;secondary_level?:number|null;secondary_subclass?:string|null;
 spell_sources?:unknown;
}
interface Cantrip {id:string;level:number;damage_at_char_level?:Record<string,string>}
/** v2.789 — use catalog tiers, not spell-slot level. Conditional expressions
 * such as Toll the Dead's d8/d12 choice remain unmodified until a choice is made.
 * UA Update p.10: Potent Thoughts belongs only to explicitly owned Psion cantrips. */
export function cantripDamage(character:Caster,spell:Cantrip,baseDice:string|null,intelligenceModifier:number){
 const unchanged={dice:baseDice,bonus:0,needsSourceReview:false};
 // True Strike's table is only its weapon rider, not the attack's full damage.
 if(spell.level!==0||spell.id==='true-strike')return unchanged;
 const primary=Number.isInteger(character.level)&&character.level>0?character.level:1;
 const secondary=character.secondary_class&&Number.isInteger(character.secondary_level)&&(character.secondary_level??0)>0?character.secondary_level!:0;
 const total=Math.min(20,primary+secondary);
 const tier=Object.keys(spell.damage_at_char_level??{}).map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=total).sort((a,b)=>b-a)[0];
 const scaled=spell.damage_at_char_level?.[String(tier)]??baseDice;
 // Only unambiguous dice expressions enter the automated damage pipeline.
 const dice=scaled&&/^\d+d\d+(?:[+-]\d+)?$/i.test(scaled)?scaled:baseDice;
 if(!dice)return unchanged;
 const telepath=(character.class_name==='Psion'&&character.subclass==='Telepath'&&primary>=6)
  ||(character.secondary_class==='Psion'&&character.secondary_subclass==='Telepath'&&secondary>=6);
 if(!telepath)return {...unchanged,dice};
 const sources=character.spell_sources;
 if(!isSpellSources(sources)||!sources[spell.id]?.length)return {dice,bonus:0,needsSourceReview:true};
 const own=sources[spell.id].some(source=>source==='class:Psion'||source==='grant:class:Psion');
 const bonus=own&&Number.isInteger(intelligenceModifier)?intelligenceModifier:0;
 return {dice,bonus,needsSourceReview:false};
}
