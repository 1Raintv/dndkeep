import {supabase} from '../supabase';
import {isConcentrationCastingContext,type ConcentrationCastingContext} from '../../rules/concentrationCasting';
export interface ConcentrationCastRequest {characterId:string;expectedRevision:number;context:ConcentrationCastingContext;previousSpell?:string|null}
export interface ConcentrationCastReceipt {concentration_spell:string;concentration_revision:number;concentration_slot_level:number;concentration_rounds_remaining:number|null;concentration_casting_context:ConcentrationCastingContext}
const key=(id:string)=>`dndkeep:concentration-cast:${id}`;
const active=new Map<string,{request:string;promise:Promise<ConcentrationCastReceipt>}>();
function valid(value:unknown):value is ConcentrationCastRequest {
 if(!value||typeof value!=='object')return false;const r=value as Partial<ConcentrationCastRequest>;
 return typeof r.characterId==='string'&&!!r.characterId&&Number.isSafeInteger(r.expectedRevision)&&r.expectedRevision!>=0&&isConcentrationCastingContext(r.context);
}
export function savedConcentrationCast(characterId:string):ConcentrationCastRequest|null {
 const raw=localStorage.getItem(key(characterId));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('The saved concentration cast is unreadable.');}
 if(!valid(value)||value.characterId!==characterId)throw new Error('The saved concentration cast does not match this character.');
 return value;
}
/** Save the exact expected revision before any await, including a queued edit flush.
 * Even an unsent intent must not rebase over a newer cast from another tab. */
export function saveConcentrationCastRequest(request:ConcentrationCastRequest){
 if(!valid(request))throw new Error('Invalid concentration casting request');
 const pending=savedConcentrationCast(request.characterId);
 if(pending&&JSON.stringify(pending)!==JSON.stringify(request))throw new Error('Confirm the previous concentration recording before starting another.');
 if(!pending)localStorage.setItem(key(request.characterId),JSON.stringify(request));
 return pending??request;
}
async function record(request:ConcentrationCastRequest):Promise<ConcentrationCastReceipt>{
 saveConcentrationCastRequest(request);
 const c=request.context;
 for(let attempt=0;;attempt++){
  let data:unknown;
  try{
   const result=await (supabase as any).rpc('record_concentration_cast',{p_character_id:request.characterId,p_request_id:c.requestId,p_expected_revision:request.expectedRevision,p_spell_id:c.spellId,p_slot_level:c.slotLevel,p_rounds:c.rounds,p_source:c.source,p_ability:c.ability});
   if(result.error)throw result.error;data=result.data;
  }catch(error){
   const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
   if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
   throw new Error(error&&typeof error==='object'&&'message' in error?String(error.message):'Concentration was not confirmed. Retry the saved recording.');
  }
  const r=data as Partial<ConcentrationCastReceipt>&{id?:string}|null;
  if(!r||r.id!==request.characterId||r.concentration_revision!==request.expectedRevision+1||r.concentration_spell!==c.spellId
   ||r.concentration_slot_level!==c.slotLevel||!isConcentrationCastingContext(r.concentration_casting_context)
   ||Object.entries(c).some(([field,value])=>r.concentration_casting_context![field as keyof ConcentrationCastingContext]!==value)
   ||!(r.concentration_rounds_remaining===null||Number.isInteger(r.concentration_rounds_remaining)&&r.concentration_rounds_remaining!>=0))
   throw new Error('The concentration receipt could not be verified. Keep the saved recording and retry.');
  // A different tab may already have staged the next cast. A late receipt
  // acknowledges only its own intent and must not erase that newer recovery.
  if(localStorage.getItem(key(request.characterId))===JSON.stringify(request))localStorage.removeItem(key(request.characterId));
  return {concentration_spell:r.concentration_spell,concentration_revision:r.concentration_revision,concentration_slot_level:r.concentration_slot_level,
   concentration_rounds_remaining:r.concentration_rounds_remaining!,concentration_casting_context:r.concentration_casting_context};
 }
}
export function recordConcentrationCast(request:ConcentrationCastRequest):Promise<ConcentrationCastReceipt>{
 const serialized=JSON.stringify(request),running=active.get(request.characterId);
 if(running)return running.request===serialized?running.promise:Promise.reject(new Error('Another concentration recording is still pending.'));
 const promise=record(request).finally(()=>active.delete(request.characterId));active.set(request.characterId,{request:serialized,promise});return promise;
}

export function discardConcentrationRecording(characterId:string,requestId?:string){
 if(active.has(characterId))throw new Error('Wait for the current recording to finish.');
 // v2.794: an explicit discard can repair corrupt local storage, but cannot
 // discard a valid request created by another tab after the error appeared.
 if(requestId===undefined){
  const raw=localStorage.getItem(key(characterId));
  let value:unknown;try{value=raw===null?null:JSON.parse(raw);}catch{value=null;}
  if(valid(value)&&value.characterId===characterId)throw new Error('A saved recording is available. Reload before discarding it.');
  if(localStorage.getItem(key(characterId))!==raw)throw new Error('The recording changed. Reload before discarding it.');
  localStorage.removeItem(key(characterId));return;
 }
 const saved=savedConcentrationCast(characterId);
 if(saved&&saved.context.requestId!==requestId)throw new Error('Another recording replaced this request. Reload before discarding it.');
 if(active.has(characterId))throw new Error('Wait for the current recording to finish.');
 localStorage.removeItem(key(characterId));
}
