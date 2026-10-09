import {notifyActionBudgetChanged} from './actionBudget';
import {supabase} from '../supabase';
import {selectedCounterspellCasting} from '../counterspellCasting';
import type {Character,PendingReaction} from '../../types';

const fields=['class_name','level','subclass','secondary_class','secondary_level','secondary_subclass',
 'intelligence','wisdom','charisma','inventory','spell_sources','spell_preparation_sources','prepared_spells'] as const;
const active=new Map<string,{request:string;promise:Promise<CounterspellReceipt>}>();
export interface CounterspellReceipt {offerId:string;castId:string;attackId:string;slotLevel:number;source:string;ability:string;saveDC:number;replayed:boolean}
/** v2.803 — One acceptance identity (the offer) pays and links the save together.
 * Capture exactly the same arguments for a transport retry; never recalculate a
 * paid choice against freshly changed slots. Realtime delivers canonical state. */
export function acceptCounterspellAtomic(offer:Pick<PendingReaction,'id'|'decision_payload'>,character:Character,slotLevel:number,sourceKey?:string):Promise<CounterspellReceipt>{
 const casting=selectedCounterspellCasting(character,sourceKey);
 if(!casting)return Promise.reject(new Error('Choose a prepared Counterspell source.'));
 const slot=character.spell_slots?.[slotLevel];
 if(!Number.isInteger(slotLevel)||slotLevel<3||slotLevel>9||!slot||slot.used>=slot.total)
  return Promise.reject(new Error('That Counterspell slot is no longer available.'));
 const castId=(offer.decision_payload as Record<string,unknown>|null)?.spell_cast_id;
 if(typeof castId!=='string'||!castId)return Promise.reject(new Error('Spell declaration is unavailable.'));
 const expected={...Object.fromEntries(fields.map(field=>[field,character[field]??null])),slot};
 const args=JSON.parse(JSON.stringify({p_offer_id:offer.id,p_slot:slotLevel,p_source:casting.source,p_ability:casting.ability,p_modifier:casting.modifier,p_expected:expected})) as Record<string,unknown>;
 const serialized=JSON.stringify(args),running=active.get(offer.id);
 if(running)return running.request===serialized?running.promise:Promise.reject(new Error('A different Counterspell choice is still being confirmed.'));
 const client=supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
 const promise=(async()=>{
  for(let attempt=0;;attempt++){
   let data:unknown;
   try{
    const result=await client.rpc('accept_counterspell_atomic',args);
    if(result.error)throw result.error;
    data=result.data;
   }catch(error){
    const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
    if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
    throw new Error(error&&typeof error==='object'&&'message' in error?String(error.message):'Counterspell could not be confirmed.');
   }
   const receipt=data as Partial<CounterspellReceipt>|null;
   if(!receipt||receipt.offerId!==offer.id||receipt.castId!==castId||typeof receipt.attackId!=='string'||!receipt.attackId
    ||receipt.slotLevel!==slotLevel||receipt.source!==casting.source||receipt.ability!==casting.ability
    ||receipt.saveDC!==casting.saveDC||typeof receipt.replayed!=='boolean')
    throw new Error('The Counterspell receipt could not be verified.');
   notifyActionBudgetChanged();return receipt as CounterspellReceipt;
  }
 })().finally(()=>active.delete(offer.id));
 active.set(offer.id,{request:serialized,promise});return promise;
}
