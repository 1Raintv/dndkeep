import {concentrationDC} from './hp';
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

/** v2.827: preview the same damage-time decision as the atomic transaction. */
export function concentrationDamageEffect(damage:number,hpAfter:number,hasSpell:boolean,incapacitated:boolean,automation:'off'|'prompt'|'auto'):{kind:'none'|'ends'|'off'|'save';dc?:number}{
 if(damage<=0||!hasSpell)return {kind:'none'};
 if(hpAfter<=0||incapacitated)return {kind:'ends'};
 return automation==='off'?{kind:'off'}:{kind:'save',dc:concentrationDC(damage)};
}
