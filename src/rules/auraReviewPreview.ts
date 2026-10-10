import {auraDamageEvidence} from './auraDamageEvidence';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** v2.869: review uses authoritative expiry flags, never assumes all stored
 * active effects still penalize this save. No RNG, spending or state writes. */
export function auraReviewPreview(context:unknown,proposal:unknown){
 const invalid=()=>new Error('Refresh the aura penalty review before choosing an outcome.');
 if(!object(context)||!object(context.save)||!object(proposal)||!Array.isArray(context.nextSaveEffects))throw invalid();
 const seen=new Set<string>();let active=false;
 for(const effect of context.nextSaveEffects){
  if(!object(effect)||typeof effect.id!=='string'||!effect.id||seen.has(effect.id)||typeof effect.expired!=='boolean')throw invalid();
  seen.add(effect.id);active ||= !effect.expired;
 }
 if(typeof context.save.autoFail!=='boolean'||(context.save.autoFail?proposal.penaltyD4!==null:
  typeof proposal.penaltyD4!=='number'||!Number.isInteger(proposal.penaltyD4)||proposal.penaltyD4<1||proposal.penaltyD4>4))throw invalid();
 const penalty=active&&!context.save.autoFail?proposal.penaltyD4 as number:0;
 const normal=auraDamageEvidence(context,{...proposal,useResistance:false},penalty);
 if(!object(context.target)||!object(context.target.participant)||!object(context.legendaryResistance))throw invalid();
 const lr=context.legendaryResistance;
 const canUseResistance=!normal.save.passed&&['creature','monster','npc'].includes(String(context.target.participant.participant_type))
  &&typeof lr.capacity==='number'&&typeof lr.used==='number'&&lr.used<lr.capacity;
 return {normal,penalty,canUseResistance,resisted:canUseResistance?auraDamageEvidence(context,{...proposal,useResistance:true},penalty):null};
}
