import {psionProgression,type PsionicClassState} from './psionProgression';
import {validPsionicRoll,type PsionicRollEnhancement} from './psionicEnhancedRoll';

export type TelekineticTechnique='boost'|'disorient'|'bolt';
export type TelekineticTechniqueEffect=
 | {kind:'boost';speedBonus:10;expiresAtStartOfTurnOf:string}
 | {kind:'disorient';preventsOpportunityAttacks:true;expiresAtStartOfTurnOf:string}
 | {kind:'bolt';damageType:'Force';damage:number};
export interface TelekineticTechniqueContext {
 caster:PsionicClassState;
 outcome:'passed'|'failed'|'cancelled'|null;
 mode:'free'|'powered'|'technique';
 movement:'push'|'warp';
 roll:number;
 enhancement?:PsionicRollEnhancement;
 casterParticipantId:string;
 targetParticipantId:string;
}
/** v2.869 — owner-provided UA update p.9. Boost expires on the caster's
 * next start; Disorient on the target's. The free d4 substitutes for the
 * Energy Die roll; a no-die 5-foot use supplies no Bolt damage roll.
 * This plans a settled effect, not permission to write it: server ownership,
 * saved-failure evidence, timing and one-choice receipts remain mandatory. */
export function telekineticTechniqueOptions(context:TelekineticTechniqueContext):TelekineticTechniqueEffect[] {
 const progression=psionProgression(context.caster);
 if(!progression||progression.level<3||progression.subclass!=='Psykinetic'||context.outcome!=='failed'||context.movement!=='push'
  ||!context.casterParticipantId?.trim()||!context.targetParticipantId?.trim()||context.casterParticipantId===context.targetParticipantId)return [];
 const enhancement=context.enhancement??{};
 if(context.mode==='free'){
  if(context.roll!==0||enhancement.surged||enhancement.enkindledRolls?.length)return [];
 }else if(context.mode==='technique'){
  if(!Number.isInteger(context.roll)||context.roll<1||context.roll>4||enhancement.surged||enhancement.enkindledRolls?.length)return [];
 }else if(context.mode==='powered'){
  if(!validPsionicRoll(progression.level,context.roll,enhancement))return [];
 }else return [];
 return [
  {kind:'boost',speedBonus:10,expiresAtStartOfTurnOf:context.casterParticipantId},
  {kind:'disorient',preventsOpportunityAttacks:true,expiresAtStartOfTurnOf:context.targetParticipantId},
  ...(context.mode==='free'?[]:[{kind:'bolt' as const,damageType:'Force' as const,damage:context.roll}]),
 ];
}

/** Saved effects can overlap across casters, but the same feature's Speed
 * increase does not stack. Expiry removes entries through the turn pipeline. */
export function hasTelekineticBoost(buffs:unknown):boolean {
 return Array.isArray(buffs)&&buffs.some(buff=>buff&&typeof buff==='object'
  &&typeof buff.key==='string'&&buff.key.startsWith('telekinetic_boost:')
  &&buff.technique==='boost'&&buff.speedBonus===10);
}
