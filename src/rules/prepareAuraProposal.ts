import {parseDiceGroups,rollDie,rollDiceGroups} from './dice';
import {rollSaveBonuses} from './saveBonuses';
import {auraReviewPreview} from './auraReviewPreview';
export interface ReviewedAuraInputs {
 baseBonus:number;conModifier:number;
 affinity:'normal'|'immune'|'resistant'|'vulnerable'|'resistant-vulnerable';
 geometryConfirmed:boolean;defensesReviewed:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869: call only inside the persisted aura preparation boundary. Every
 * die uses canonical rules; the returned evidence is saved before review.
 * Geometry, defenses and base modifiers are explicitly reviewed inputs,
 * not claims that the client has independently established those facts. */
export function prepareAuraProposal(context:unknown,requestId:string,inputs:ReviewedAuraInputs,concentrationId:string){
 const invalid=()=>new Error('Review aura inputs before preparing its saved rolls.');
 if(!object(context)||!object(context.save)||!object(context.aura)||!object(context.aura.aura)||!inputs)throw invalid();
 const state=context.save,spec=context.aura.aura;
 if(![state.autoFail,state.advantage,state.disadvantage,state.naturalExtremes].every(v=>typeof v==='boolean')
  ||!Array.isArray(state.buffs)||!Number.isInteger(state.exhaustion)||Number(state.exhaustion)<0||Number(state.exhaustion)>6
  ||!Number.isSafeInteger(inputs.baseBonus)||inputs.baseBonus< -1000||inputs.baseBonus>1000
  ||!Number.isSafeInteger(inputs.conModifier)||inputs.conModifier< -105||inputs.conModifier>120
  ||inputs.geometryConfirmed!==true||inputs.defensesReviewed!==true
  ||!['normal','immune','resistant','vulnerable','resistant-vulnerable'].includes(inputs.affinity)
  ||!uuid(requestId)||!uuid(concentrationId)||requestId.toLowerCase()===concentrationId.toLowerCase()
  ||(spec.damageDice!==null&&(typeof spec.damageDice!=='string'||!parseDiceGroups(spec.damageDice))))throw invalid();
 const effects=state.autoFail?[]:rollSaveBonuses(state.buffs,0).rolls;
 const dice=Array.from({length:state.autoFail?0:state.advantage!==state.disadvantage?2:1},()=>rollDie(20));
 const proposal={save:{baseBonus:state.autoFail?0:inputs.baseBonus,dice,effectRolls:effects},
  penaltyD4:state.autoFail?null:rollDie(4),damageRoll:spec.damageDice===null?null:rollDiceGroups(spec.damageDice as string),
  affinity:inputs.affinity,useResistance:false,concentrationId,conModifier:inputs.conModifier,geometryConfirmed:true,defensesReviewed:true};
 // Check the entire proposal with the same verifier used by the review UI.
 // If preparation fails, the recovery layer retains its interruption marker.
 auraReviewPreview(context,proposal);
 return proposal;
}
