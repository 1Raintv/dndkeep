import {psionProgression} from './psionProgression';
import {psionicPoolRemaining} from './psionicRestoration';
import {validPsionicRoll,type PsionicRollEnhancement} from './psionicEnhancedRoll';
import {connectionRangeDisplay,telepathyBaseRange} from './telepathicConnection';
import type {PsionicPowerCharacter} from './psionicPowers';
export type TelepathicReaction='distraction'|'bolstering';
export interface TelepathicReactionContext {
 character:PsionicPowerCharacter;
 reactionAvailable:boolean;
 canTakeReactions:boolean;
 connectionEffects:readonly {total:number|null;remainingSeconds:number|null}[];
 subject:{self:boolean;visible:boolean;distanceFeet:number};
 /** Capture from the original, unresolved event. Natural attack extremes and
  * explicit automatic outcomes cannot be changed by a numeric modifier. */
 event:{kind:'attack'|'check';d20:number;total:number;threshold:number;successful:boolean;automatic:'none'|'success'|'failure'};
}
export type TelepathicReactionPlan={ok:false;reason:'ineligible'|'reaction-unavailable'|'range-unverified'|'target'|'event'|'no-dice'|'roll'}|
 {ok:true;reactionCost:1;energyCost:0|1;remaining:number;originalTotal:number;total:number;successful:boolean;changed:boolean};
/** v2.869 — owner's UA Update p.10. Preview only: a saved transaction must bind
 * the original event, lock Reaction/energy state, and apply this outcome once.
 * Never use this plan as permission for independent client resource writes. */
export function planTelepathicReaction(context:TelepathicReactionContext,feature:TelepathicReaction,roll:number,enhancement:PsionicRollEnhancement={}):TelepathicReactionPlan {
 const p=psionProgression(context.character);
 if(!p||p.subclass!=='Telepath'||!['distraction','bolstering'].includes(feature)||p.level<(feature==='distraction'?3:10))return {ok:false,reason:'ineligible'};
 if(context.reactionAvailable!==true||context.canTakeReactions!==true)return {ok:false,reason:'reaction-unavailable'};
 const display=connectionRangeDisplay(telepathyBaseRange(context.character)!,context.connectionEffects);
 if(display.needsReview)return {ok:false,reason:'range-unverified'};
 const subject=context.subject;
 if(typeof subject.self!=='boolean'||typeof subject.visible!=='boolean'||!Number.isFinite(subject.distanceFeet)||subject.distanceFeet<0
  ||(subject.self&&subject.distanceFeet!==0)||subject.distanceFeet>display.range
  ||(!subject.visible&&!(feature==='bolstering'&&subject.self)))return {ok:false,reason:'target'};
 const event=context.event;
 if(!['attack','check'].includes(event.kind)||!Number.isInteger(event.d20)||event.d20<1||event.d20>20
  ||!Number.isSafeInteger(event.total)||!Number.isSafeInteger(event.threshold)||typeof event.successful!=='boolean'
  ||!['none','success','failure'].includes(event.automatic)||(feature==='distraction'&&event.kind!=='attack'))return {ok:false,reason:'event'};
 const success=(total:number)=>event.automatic==='success'?true:event.automatic==='failure'?false:
  event.kind==='attack'&&event.d20===20?true:event.kind==='attack'&&event.d20===1?false:total>=event.threshold;
 if(event.successful!==success(event.total)||event.successful!==(feature==='distraction'))return {ok:false,reason:'event'};
 const remaining=psionicPoolRemaining(p.level,context.character.class_resources?.['psionic-energy-dice']);
 if(remaining===null||remaining<1)return {ok:false,reason:'no-dice'};
 if(!validPsionicRoll(p.level,roll,enhancement))return {ok:false,reason:'roll'};
 const total=event.total+(feature==='distraction'?-roll:roll);
 if(!Number.isSafeInteger(total))return {ok:false,reason:'event'};
 const successful=success(total),changed=successful!==event.successful,energyCost=changed?1:0;
 return {ok:true,reactionCost:1,energyCost,remaining:remaining-energyCost,originalTotal:event.total,total,successful,changed};
}
