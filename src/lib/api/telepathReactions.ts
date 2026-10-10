import {psionicRpc} from './psionicTurns';
import {validActionBudget,type SavedActionBudget} from './actionBudget';
import {readAttackRollSnapshot,type AttackRollSnapshot} from '../../rules/attackRollSnapshot';
import {attackRollOutcome,type AttackRollOutcome} from '../../rules/attackRollOutcome';
import {psionicDieCount} from '../../rules/psionicRestoration';
import type {TelepathicReaction} from '../../rules/telepathicReactions';
export interface TelepathAttackContext {
 characterId:string;feature:TelepathicReaction;psionLevel:number;energyRemaining:number;budget:SavedActionBudget;reactionAvailable:boolean;
 telepathyRange:number|null;rangeVerified:boolean;spatialReviewRequired:true;
 subject:{participantId:string;combatantId:string;entityId:string;participantType:string;self:boolean};
 attack:{id:string;triggerTurnId:string;updatedAt:string;snapshot:AttackRollSnapshot;total:number;targetAC:number;result:AttackRollOutcome;cover:string|null};
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869 — preparation is not permission to spend. Reject inconsistent server
 * evidence before offering any fresh dice or constructing a spatial preview. */
export function validTelepathAttackContext(value:unknown,characterId:string,attackId:string,feature:TelepathicReaction):value is TelepathAttackContext {
 const c=value as TelepathAttackContext|null;
 if(!uuid(characterId)||!c||c.characterId!==characterId||c.feature!==feature||!['distraction','bolstering'].includes(feature)
  ||!Number.isInteger(c.psionLevel)||c.psionLevel<(feature==='bolstering'?10:3)||c.psionLevel>20
  ||!Number.isInteger(c.energyRemaining)||c.energyRemaining<0||c.energyRemaining>psionicDieCount(c.psionLevel)
  ||!validActionBudget(c.budget,characterId)||!uuid(c.budget.context.encounterId)||!uuid(c.budget.context.participantId)
  ||typeof c.reactionAvailable!=='boolean'||(c.reactionAvailable&&c.budget.spent.reaction)
  ||typeof c.rangeVerified!=='boolean'||c.spatialReviewRequired!==true)return false;
 const base=c.psionLevel>=6?60:30;
 if(c.rangeVerified?(!Number.isInteger(c.telepathyRange)||c.telepathyRange!<base||c.telepathyRange!>base+360||(c.telepathyRange!-base)%10!==0):c.telepathyRange!==null)return false;
 const a=c.attack,s=readAttackRollSnapshot(a?.snapshot),subject=c.subject;
 if(!a||a.id!==attackId||!uuid(a.triggerTurnId)||a.triggerTurnId!==c.budget.context.turnId||!uuid(attackId)||!s||s.attackId!==attackId||s.encounterId!==c.budget.context.encounterId
  ||!uuid(s.attackerId)||!uuid(s.targetId)||typeof a.updatedAt!=='string'||!Number.isFinite(Date.parse(a.updatedAt))
  ||![null,'none','half','three_quarters','total'].includes(a.cover)||!subject||!uuid(subject.participantId)||!uuid(subject.combatantId)
  ||typeof subject.entityId!=='string'||!subject.entityId||!['character','creature','monster','npc'].includes(subject.participantType)
  ||subject.participantId!==s.attackerId||subject.self!==(subject.participantId===c.budget.context.participantId))return false;
 const result=attackRollOutcome({...s,total:a.total,targetAC:a.targetAC,automatic:a.cover==='total'?'failure':s.automatic});
 return result!==null&&a.result===result&&(feature==='distraction'?['hit','crit'].includes(result):['miss','fumble'].includes(result));
}
export async function getTelepathAttackContext(characterId:string,attackId:string,feature:TelepathicReaction):Promise<TelepathAttackContext>{
 if(!uuid(characterId)||!uuid(attackId)||!['distraction','bolstering'].includes(feature))throw new Error('Invalid Telepath reaction identity.');
 const result=await psionicRpc('get_telepath_attack_context',{p_character:characterId,p_attack:attackId,p_feature:feature});
 if(!validTelepathAttackContext(result,characterId,attackId,feature))throw new Error('Telepath attack context could not be verified. Refresh before rolling.');
 return result;
}

export interface TelepathCancellation {requestId:string;cancelled:true;reactionCost:1;energyCost:0;energy:null;replayed:boolean;cancelReason?:string}
/** Original-campaign DM cleanup only. Reuse the saved declaration identity on
 * every retry; this must never settle dice or refund the already claimed Reaction. */
export async function cancelTelepathReactionByDm(requestId:string,reason:string):Promise<TelepathCancellation>{
 const note=reason.trim();
 if(!uuid(requestId)||!note||note.length>500)throw new Error('Choose the saved reaction and enter a cancellation reason (1–500 characters).');
 const result=await psionicRpc('cancel_telepath_reaction_by_dm',{p_request:requestId,p_reason:note},true) as TelepathCancellation|null;
 if(!result||result.requestId!==requestId||result.cancelled!==true||result.reactionCost!==1||result.energyCost!==0||result.energy!==null||typeof result.replayed!=='boolean'
  ||result.cancelReason!==undefined&&typeof result.cancelReason!=='string')throw new Error('Cancellation could not be confirmed. Keep the saved reaction and retry; do not roll again.');
 return result;
}
