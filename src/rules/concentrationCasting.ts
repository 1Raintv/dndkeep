import {isSpellSources,type SpellSource} from './spellSources';
import {spellCastingNumbers,type CastingAbility} from './spellCasting';
export type ConcentrationCastSource={source:SpellSource;ability:CastingAbility};
export interface ConcentrationCastingContext {requestId:string;spellId:string;slotLevel:number;rounds:number|null;source:SpellSource;ability:CastingAbility}
export function isConcentrationCastingContext(value:unknown):value is ConcentrationCastingContext {
 if(!value||typeof value!=='object')return false;
 const c=value as Partial<ConcentrationCastingContext>;
 return typeof c.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.requestId)
  &&typeof c.spellId==='string'&&c.spellId.length>0&&c.spellId.length<=160
  &&Number.isInteger(c.slotLevel)&&c.slotLevel!>=0&&c.slotLevel!<=9
  &&(c.rounds===null||Number.isInteger(c.rounds)&&c.rounds!>0)
  &&isSpellSources({spell:[c.source]})&&['intelligence','wisdom','charisma'].includes(c.ability??'');
}
/** The ongoing spell keeps its cast source even when tab choices/preparation change. */
export function concentrationCastingNumbers(context:unknown,spellId:string,modifiers:Record<CastingAbility,number>,proficiency:number){
 return isConcentrationCastingContext(context)&&context.spellId===spellId?spellCastingNumbers(context.ability,modifiers,proficiency):null;
}
