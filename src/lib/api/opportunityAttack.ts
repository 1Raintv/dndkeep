import {supabase} from '../supabase';
import {notifyActionBudgetChanged} from './actionBudget';
import type {PendingReaction} from '../../types';
export interface OpportunityAttackChoice {name:string;bonus:number;dice:string;damageType:string}
export interface OpportunityAttackReceipt {offerId:string;attackId:string;actorId:string;targetId:string;replayed:boolean}
const active=new Map<string,{key:string;promise:Promise<OpportunityAttackReceipt>}>();
/** v2.869 — retries keep the offer and weapon choice. The server spends the
 * reaction, creates the attack and saves history together. */
export function acceptOpportunityAttack(offer:Pick<PendingReaction,'id'|'reactor_participant_id'|'decision_payload'>,choice:OpportunityAttackChoice):Promise<OpportunityAttackReceipt>{
 const target=(offer.decision_payload as Record<string,unknown>|null)?.mover_participant_id;
 if(typeof target!=='string'||!target||!Number.isInteger(choice.bonus))return Promise.reject(new Error('Review the Opportunity Attack details.'));
 const args={p_offer:offer.id,p_name:choice.name,p_bonus:choice.bonus,p_dice:choice.dice,p_damage_type:choice.damageType};
 const key=JSON.stringify(args),running=active.get(offer.id);
 if(running)return running.key===key?running.promise:Promise.reject(new Error('A different Opportunity Attack choice is still being confirmed.'));
 const client=supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
 const promise=(async()=>{
  for(let attempt=0;;attempt++){
   let data:unknown;
   try{const result=await client.rpc('accept_opportunity_attack',args);if(result.error)throw result.error;data=result.data;}
   catch(error){
    const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
    if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
    throw new Error(error&&typeof error==='object'&&'message' in error?String(error.message):'Opportunity Attack could not be confirmed.');
   }
   const r=data as Partial<OpportunityAttackReceipt>|null;
   if(!r||r.offerId!==offer.id||r.actorId!==offer.reactor_participant_id||r.targetId!==target||typeof r.attackId!=='string'||!r.attackId||typeof r.replayed!=='boolean')throw new Error('The Opportunity Attack receipt could not be verified. Retry the same choice.');
   notifyActionBudgetChanged();return r as OpportunityAttackReceipt;
  }
 })().finally(()=>active.delete(offer.id));
 active.set(offer.id,{key,promise});return promise;
}
