import {psionProgression,type PsionicClassState} from './psionProgression';
import {psionicPoolRemaining} from './psionicRestoration';
import {validPsionicRoll,type PsionicRollEnhancement} from './psionicEnhancedRoll';

/** Owner-provided UA update pp.7–8. These rules describe a proposed activation;
 * the saved transaction must separately enforce ownership, Bonus Action, payment
 * and game-time expiry. Never use this result as proof that a form is active. */
export const MUTABLE_FORM_RESISTANCES=['Acid','Bludgeoning','Cold','Fire','Lightning','Piercing','Poison','Slashing','Thunder'] as const;
export type MutableFormChoice =
 | {kind:'stony';resistance:typeof MUTABLE_FORM_RESISTANCES[number]}
 | {kind:'stride'} | {kind:'flexibility'};
export interface MutableFormCharacter extends PsionicClassState {
 class_resources?:Record<string,unknown>|null;
}
export interface MutableFormOptions {
 fleshWeaver:boolean;
 improvement:MutableFormChoice|null;
}
export interface MutableFormSpec extends MutableFormOptions {
 durationSeconds:60|600;
}
export function mutableFormEligibility(c:MutableFormCharacter) {
 const p=psionProgression(c),level=p?.level??0;
 const pool=psionicPoolRemaining(level,c.class_resources?.['psionic-energy-dice']);
 const eligible=p?.subclass==='Metamorph'&&level>=3;
 return {eligible,level,pool,
  fleshWeaver:eligible&&level>=6,improved:eligible&&level>=10,durationSeconds:level>=10?600 as const:60 as const};
}
function validImprovement(value:MutableFormChoice|null,improved:boolean):boolean {
 if(!improved)return value===null;
 if(!value||typeof value!=='object')return false;
 const keys=Object.keys(value).sort().join(',');
 if(value.kind==='stony')return keys==='kind,resistance'&&MUTABLE_FORM_RESISTANCES.includes(value.resistance);
 return (value.kind==='stride'||value.kind==='flexibility')&&keys==='kind';
}
/** v2.869 — Flesh Weaver costs one EXTRA die on activation. Its later healing
 * roll has a separate cost; neither activation die is a second temp-HP roll. */
export function planMutableForm(c:MutableFormCharacter,options:MutableFormOptions,
 roll:number,intelligenceModifier:number,enhancement:PsionicRollEnhancement={}) {
 const s=mutableFormEligibility(c);
 if(!s.eligible||s.pool===null||typeof options.fleshWeaver!=='boolean'
  ||(options.fleshWeaver&&!s.fleshWeaver)||!validImprovement(options.improvement,s.improved)
  ||!Number.isInteger(intelligenceModifier)||intelligenceModifier < -5||intelligenceModifier>10
  ||!validPsionicRoll(s.level,roll,enhancement))return null;
 const cost=options.fleshWeaver?2:1;
 if(s.pool<cost)return null;
 const form:MutableFormSpec={durationSeconds:s.durationSeconds,fleshWeaver:options.fleshWeaver,
  improvement:options.improvement?{...options.improvement}:null};
 // Temporary HP is a grant, not a timed modifier. The caller must resolve its
 // replacement separately; ending the form must not subtract this amount.
 return {cost,remaining:s.pool-cost,temporaryHitPoints:Math.max(1,roll+intelligenceModifier),form};
}
/** Read live armor state: equipping armor suppresses Superior Stride's benefits
 * without ending the form, its ordinary Speed increase, or its reach increase. */
export function mutableFormBenefits(form:MutableFormSpec,wearingArmor:boolean) {
 const choice=form.improvement;
 return {reachBonus:5,speedBonus:5,touchActionRange:10,
  acBonus:(form.fleshWeaver?2:0)+(choice?.kind==='flexibility'?1:0),
  empoweredHealing:form.fleshWeaver,
  concentrationSaveAdvantage:choice?.kind==='stony',
  resistance:choice?.kind==='stony'?choice.resistance:null,
  bonusActionDash:choice?.kind==='stride'&&!wearingArmor,
  climbAndSwimEqualSpeed:choice?.kind==='stride'&&!wearingArmor,
  minimumSpaceInches:choice?.kind==='flexibility'?1:null,
  escapeMovementFeet:choice?.kind==='flexibility'?5:null};
}
/** This is optional for each casting, applies to any spell source, and does not
 * convert Bonus Action/Reaction Touch spells or change existing ranged spells. */
export function mutableFormSpellRange(spell:{range:string;casting_time:string},apply:boolean):string {
 return apply&&spell.range.trim().toLowerCase()==='touch'&&/^1\s+(?:magic\s+)?action$/i.test(spell.casting_time.trim())?'10 feet':spell.range;
}
