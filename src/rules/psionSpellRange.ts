import {psionProgression,type PsionicClassState} from './psionProgression';
interface SpellRange {id:string;level:number;range:string}
/** v2.869 — owner-provided UA update p.9: this modifies Mage Hand from any
 * casting source. It does not change the hand's movement or other base rules. */
export function hasStrongerTelekinesis(character:PsionicClassState,spell:Pick<SpellRange,'id'|'level'>):boolean {
 const progression=psionProgression(character);
 return spell.id==='mage-hand'&&spell.level===0&&progression?.subclass==='Psykinetic'&&progression.level>=3;
}
export function psionSpellRange(character:PsionicClassState,spell:SpellRange):string {
 if(!hasStrongerTelekinesis(character,spell))return spell.range;
 const match=/^(\d+)\s*(feet|foot|ft\.?)$/i.exec(spell.range.trim());
 return match?`${Number(match[1])+30} ${match[2]}`:spell.range;
}
