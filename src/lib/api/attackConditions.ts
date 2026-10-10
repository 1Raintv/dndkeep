import {psionicRpc} from './psionicTurns';
export interface AttackConditionReceipt {attackId:string;condition:string;outcome:'saved'|'immune'|'applied'|'already_present';replayed:boolean}
/** A null result means the declaration predates saved condition intent. */
export async function settleAttackCondition(attackId:string):Promise<AttackConditionReceipt|null>{
 const r=await psionicRpc('settle_attack_condition',{p_attack:attackId},true) as AttackConditionReceipt|null;
 if(r===null)return null;
 if(!r||r.attackId!==attackId||typeof r.condition!=='string'||!r.condition||!['saved','immune','applied','already_present'].includes(r.outcome)||typeof r.replayed!=='boolean')throw new Error('Condition resolution could not be confirmed. Retry the same attack.');
 return r;
}
