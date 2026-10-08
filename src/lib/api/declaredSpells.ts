import {supabase} from '../supabase';
import type {PendingSpellCast} from '../../types';
import {isSpellDeclarationRequest,type SpellDeclarationRequest} from '../spellDeclarationRequest';
export const SPELL_DECLARATION_CHANGED='dndkeep:spell-declaration-changed';
const key=(userId:string,characterId:string)=>`dndkeep:declared-spell:${userId}:${characterId}`;
const active=new Map<string,{request:string;promise:Promise<PendingSpellCast>}>();
const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event(SPELL_DECLARATION_CHANGED));};
export function savedSpellDeclaration(userId:string,characterId:string):SpellDeclarationRequest|null{
 const raw=localStorage.getItem(key(userId,characterId));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('The saved spell declaration is unreadable.');}
 if(!isSpellDeclarationRequest(value)||value.userId!==userId||value.characterId!==characterId)throw new Error('The saved spell declaration does not match this character.');
 return value;
}
export function saveSpellDeclaration(request:SpellDeclarationRequest){
 if(!isSpellDeclarationRequest(request))throw new Error('Invalid spell declaration.');
 const existing=savedSpellDeclaration(request.userId,request.characterId);
 if(existing&&JSON.stringify(existing)!==JSON.stringify(request))throw new Error('Resolve the saved spell declaration before starting another.');
 if(!existing){localStorage.setItem(key(request.userId,request.characterId),JSON.stringify(request));notify();}
 return existing??JSON.parse(JSON.stringify(request)) as SpellDeclarationRequest;
}
/** Acknowledgment is explicit. Never clear a newer request written by another tab. */
export function acknowledgeSpellDeclaration(request:SpellDeclarationRequest){
 const recordKey=key(request.userId,request.characterId);
 if(active.has(recordKey))throw new Error('Wait for the casting request to finish.');
 const current=savedSpellDeclaration(request.userId,request.characterId);
 if(current&&JSON.stringify(current)!==JSON.stringify(request))throw new Error('Another casting request replaced this one.');
 if(current){localStorage.removeItem(recordKey);notify();}
}
const client=supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
async function rpc(name:string,args:Record<string,unknown>){
 for(let attempt=0;;attempt++){
  try{const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data;}
  catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
   if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
   throw new Error(error&&typeof error==='object'&&'message' in error?String(error.message):'The spell could not be confirmed. Resume its saved request.');}
 }
}
/** No optimistic slot write, no changing cast ID, no fallback to legacy inserts. */
export function declarePaidSpell(request:SpellDeclarationRequest):Promise<PendingSpellCast>{
 const captured=saveSpellDeclaration(request),recordKey=key(captured.userId,captured.characterId),serialized=JSON.stringify(captured);
 const running=active.get(recordKey);if(running)return running.request===serialized?running.promise:Promise.reject(new Error('Another declaration is still being confirmed.'));
 const promise=(async()=>{
  const data=await rpc('declare_spell_cast_atomic',{p_cast_id:captured.castId,p_character_id:captured.characterId,p_participant_id:captured.participantId,
   p_spell_id:captured.spellId,p_spell_name:captured.spellName,p_slot:captured.slotLevel,p_expected_slot:captured.expectedSlot,p_context:captured.context});
  const row=(data as {cast?:Partial<PendingSpellCast>}|null)?.cast;
  if(!row||row.id!==captured.castId||row.caster_character_id!==captured.characterId||row.caster_participant_id!==captured.participantId
   ||row.campaign_id!==captured.campaignId||row.spell_level!==captured.slotLevel||row.spell_name!==captured.spellName
   ||!['declared','counterspell_offered','countered','resolved','canceled'].includes(row.state??'')
   ||typeof row.chain_id!=='string'||!row.chain_id||!Number.isFinite(Date.parse(row.expires_at??'')))throw new Error('The spell declaration receipt could not be verified.');
  return row as PendingSpellCast;
 })().finally(()=>active.delete(recordKey));
 active.set(recordKey,{request:serialized,promise});return promise;
}
export interface SpellSettlementReceipt{castId:string;outcome:'went_off'|'saved_through'|'countered';slotReturned:boolean;replayed:boolean}
export async function settlePaidSpell(castId:string):Promise<SpellSettlementReceipt|{legacy:true;castId:string}>{
 const data=await rpc('settle_declared_spell_atomic',{p_cast_id:castId});
 const receipt=data as Partial<SpellSettlementReceipt>&{legacy?:boolean}|null;
 if(receipt?.legacy===true&&receipt.castId===castId)return {legacy:true,castId};
 if(!receipt||receipt.castId!==castId||!['went_off','saved_through','countered'].includes(receipt.outcome??'')
  ||typeof receipt.slotReturned!=='boolean'||typeof receipt.replayed!=='boolean')throw new Error('The spell settlement receipt could not be verified.');
 return receipt as SpellSettlementReceipt;
}
