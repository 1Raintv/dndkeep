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
export function acknowledgeSpellDeclaration(request:SpellDeclarationRequest){forgetDeclaration(request,false);}
function forgetDeclaration(request:SpellDeclarationRequest,canceled:boolean){
 const recordKey=key(request.userId,request.characterId);
 if(!canceled&&active.has(recordKey))throw new Error('Wait for the casting request to finish.');
 const current=savedSpellDeclaration(request.userId,request.characterId);
 if(current&&JSON.stringify(current)!==JSON.stringify(request))throw new Error('Another casting request replaced this one.');
 if(canceled&&active.get(recordKey)?.request===JSON.stringify(request))active.delete(recordKey);
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
  return verifiedCast(row,captured);
 })().finally(()=>{if(active.get(recordKey)?.promise===promise)active.delete(recordKey);});
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

function verifiedCast(row:Partial<PendingSpellCast>|null|undefined,request:SpellDeclarationRequest):PendingSpellCast{
  if(!row||row.id!==request.castId||row.caster_character_id!==request.characterId||row.caster_participant_id!==request.participantId
   ||row.campaign_id!==request.campaignId||row.spell_level!==request.slotLevel||row.spell_name!==request.spellName
   ||!['declared','counterspell_offered','countered','resolved','canceled'].includes(row.state??'')
   ||typeof row.chain_id!=='string'||!row.chain_id||!Number.isFinite(Date.parse(row.expires_at??'')))throw new Error('The spell declaration receipt could not be verified.');
 return row as PendingSpellCast;
}
/** A read may decide when to ask for settlement, never its outcome or refund.
 * The transaction rechecks the linked save and private payment before changing it. */
export async function readDeclaredSpell(request:SpellDeclarationRequest):Promise<{cast:PendingSpellCast;readyToSettle:boolean}>{
 const {data,error}=await supabase.from('pending_spell_casts').select('*').eq('id',request.castId).maybeSingle();
 if(error)throw new Error(error.message);
 const cast=verifiedCast(data as unknown as PendingSpellCast|null,request);
 if(cast.state==='countered'||cast.state==='resolved')return {cast,readyToSettle:true};
 if(cast.state==='declared')return {cast,readyToSettle:Date.parse(cast.expires_at)<=Date.now()};
 if(cast.state==='canceled')throw new Error('This declaration was canceled. Review its payment before continuing.');
 if(!cast.counterspell_attack_id)throw new Error('The Counterspell save is not linked yet. Retry to confirm it.');
 const save=await supabase.from('pending_attacks').select('save_result,pending_lr_decision').eq('id',cast.counterspell_attack_id)
  .eq('campaign_id',request.campaignId).eq('target_participant_id',request.participantId).maybeSingle();
 if(save.error)throw new Error(save.error.message);
 if(!save.data)throw new Error('The Counterspell save could not be loaded.');
 return {cast,readyToSettle:['passed','failed'].includes(save.data.save_result??'')&&!save.data.pending_lr_decision};
}

export async function declarationParticipant(characterId:string,campaignId:string):Promise<string|null>{
 const encounter=await supabase.from('combat_encounters').select('id').eq('campaign_id',campaignId).eq('status','active').maybeSingle();
 if(encounter.error)throw new Error(encounter.error.message);if(!encounter.data)return null;
 const participant=await supabase.from('combat_participants').select('id').eq('encounter_id',encounter.data.id).eq('entity_id',characterId).eq('participant_type','character').maybeSingle();
 if(participant.error)throw new Error(participant.error.message);return participant.data?.id??null;
}

/** Only a verified server tombstone permits forgetting a still-in-flight request.
 * Its late completion must not remove a newer declaration from the active map. */
export async function cancelUnpaidDeclaration(request:SpellDeclarationRequest):Promise<boolean>{
 if(!isSpellDeclarationRequest(request))throw new Error('Invalid spell declaration.');
 const data=await rpc('cancel_unpaid_spell_atomic',{p_cast_id:request.castId,p_character_id:request.characterId});
 const receipt=data as {castId?:string;characterId?:string;canceled?:boolean;replayed?:boolean}|null;
 if(!receipt||receipt.castId!==request.castId||receipt.characterId!==request.characterId||typeof receipt.canceled!=='boolean'||typeof receipt.replayed!=='boolean')
  throw new Error('The cancellation receipt could not be verified.');
 if(receipt.canceled)forgetDeclaration(request,true);
 return receipt.canceled;
}
export interface SpellAttackReceipt {castId:string;attackId:string;characterId:string;kind:'attack_roll'|'save'|'auto_hit';replayed:boolean}
/** The server delivers only the immutable paid intent after settlement. */
export async function queueDeclaredSpellAttack(request:SpellDeclarationRequest):Promise<SpellAttackReceipt>{
 if(!request.context.combat)throw new Error('This casting has no saved combat target.');
 const data=await rpc('queue_declared_spell_attack',{p_cast_id:request.castId});
 const receipt=data as Partial<SpellAttackReceipt>|null;
 if(!receipt||receipt.castId!==request.castId||receipt.attackId!==request.castId||receipt.characterId!==request.characterId
  ||receipt.kind!==request.context.combat.kind||typeof receipt.replayed!=='boolean')throw new Error('Spell attack delivery could not be confirmed. Resume the saved casting.');
 return receipt as SpellAttackReceipt;
}
