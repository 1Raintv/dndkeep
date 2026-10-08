import {rollDie} from './dice';
import {savingThrowPassed} from './savingThrows';
/** v2.809 — 2024 War Caster affects concentration saves, not every CON save. */
export function hasWarCaster(feats:readonly string[]|null|undefined):boolean {
 return !!feats?.some(feat=>feat.trim().toLowerCase()==='war caster');
}
/** Keep the actual dice separate from the selected result for history/animation. */
export function rollConcentrationCheck(bonus:number,dc:number,advantage:boolean,naturalExtremes:boolean){
 const rolls=Array.from({length:advantage?2:1},()=>rollDie(20));
 const d20=Math.max(...rolls),total=d20+bonus;
 return {rolls,d20,total,passed:savingThrowPassed(d20,total,dc,{naturalExtremes})};
}
