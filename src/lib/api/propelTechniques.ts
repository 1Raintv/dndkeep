import {telekineticTechniqueOptions,type TelekineticTechnique} from '../../rules/telekineticTechniques';
import {validPropelRecord,type PropelRecord,type PropelRoll} from './psionicPropel';
import {psionicRpc,PsionicRequestError} from './psionicTurns';
export type PropelTechniqueChoice=TelekineticTechnique|'none';
export interface PropelTechniqueReceipt {
 declarationId:string;characterId:string;choice:PropelTechniqueChoice;actorId:string;targetId:string;
 buff:Record<string,unknown>|null;attackId:string|null;damage:number|null;roll:PropelRoll;replayed:boolean;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869 — an old/manual record cannot manufacture original participants.
 * Use the saved caster progression and roll; current authority remains server-owned. */
export function availablePropelTechniques(row:PropelRecord){
 if(!validPropelRecord(row,row.character_id)||!row.roll_result||!row.participant_bindings||!('encounterId' in row.turn_context))return [];
 const b=row.participant_bindings,a=b.actor,t=b.target;
 if(!a||!t||!uuid(b.campaignId)||b.campaignId!==row.caster_snapshot.campaign_id||b.encounterId!==row.turn_context.encounterId
  ||!uuid(a.id)||!uuid(a.combatantId)||!uuid(t.id)||!uuid(t.combatantId)||a.id===t.id
  ||a.participantType!=='character'||a.entityId!==row.character_id||a.definitionType!=='character'||a.definitionId!==row.character_id
  ||t.id!==row.target.participantId||!['character','creature'].includes(t.participantType)||!t.entityId||t.definitionId!==t.entityId
  ||(t.definitionType==='character')!==(t.participantType==='character'))return [];
 return telekineticTechniqueOptions({caster:row.caster_snapshot,outcome:row.outcome,mode:row.mode,movement:row.movement,
  roll:row.roll_result.total,enhancement:{originalRoll:row.base_roll,surged:row.roll_result.usedSurge,enkindledRolls:row.roll_result.enkindledRolls},casterParticipantId:a.id,targetParticipantId:t.id});
}
function sameRoll(value:unknown,expected:PropelRoll):boolean{
 const roll=value as PropelRoll|null;
 return !!roll&&roll.declarationId===expected.declarationId&&roll.total===expected.total&&roll.usedSurge===expected.usedSurge
  &&(['originalRolls','enkindledRolls','rolls'] as const).every(key=>Array.isArray(roll[key])&&roll[key].length===expected[key].length&&roll[key].every((n,i)=>n===expected[key][i]));
}
export function validPropelTechniqueReceipt(value:unknown,row:PropelRecord):value is PropelTechniqueReceipt{
 const r=value as PropelTechniqueReceipt|null,options=availablePropelTechniques(row),binding=row.participant_bindings;
 if(!r||!binding||!row.roll_result||!options.length||r.declarationId!==row.request_id||r.characterId!==row.character_id
  ||r.actorId!==binding.actor.id||r.targetId!==binding.target.id||typeof r.replayed!=='boolean'||!sameRoll(r.roll,row.roll_result))return false;
 if(r.choice==='none')return r.buff===null&&r.attackId===null&&r.damage===null;
 const option=options.find(o=>o.kind===r.choice);if(!option)return false;
 if(option.kind==='bolt')return r.buff===null&&r.attackId===row.request_id&&r.damage===option.damage;
 const buff=r.buff;
 if(!buff||typeof buff!=='object'||Array.isArray(buff)||r.attackId!==null||r.damage!==null)return false;
 const expected={key:`telekinetic_${option.kind}:${row.request_id}`,name:option.kind==='boost'?'Telekinetic Boost':'Telekinetic Disorient',source:'Telekinetic Techniques',technique:option.kind,
  casterParticipantId:binding.actor.id,expiresAtStartOfTurnOf:option.expiresAtStartOfTurnOf,...(option.kind==='boost'?{speedBonus:10}:{preventsOpportunityAttacks:true})};
 return Object.keys(buff).length===Object.keys(expected).length&&Object.entries(expected).every(([key,value])=>buff[key]===value);
}
/** Reads and retries use the original declaration; no dice or resource mutation
 * occurs locally. Unverified successes remain uncertain, never a fresh choice. */
export async function choosePropelTechnique(input:PropelRecord,choice:PropelTechniqueChoice|null=null):Promise<PropelTechniqueReceipt|null>{
 const row=structuredClone(input),options=availablePropelTechniques(row);
 if(!options.length||(choice!==null&&choice!=='none'&&!options.some(o=>o.kind===choice)))throw new PsionicRequestError('This saved Propel cannot use that technique.',true);
 const result=await psionicRpc('choose_propel_technique',{p_character:row.character_id,p_declaration:row.request_id,p_choice:choice},true);
 if(result===null&&choice===null)return null;
 if(!validPropelTechniqueReceipt(result,row)||(choice!==null&&result.choice!==choice))throw new PsionicRequestError('The saved technique could not be verified. Keep the same choice and retry; do not apply it again.',false);
 return result;
}
