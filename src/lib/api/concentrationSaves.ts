import {supabase} from '../supabase';
import {rollDie} from '../../rules/dice';
export type ConcentrationResolutionSource='player'|'timeout';
export interface SavedConcentrationRoll {characterId:string;pendingId:string;d20:number;source:ConcentrationResolutionSource}
export interface ConcentrationReceipt {pendingId:string;outcome:'passed'|'failed'|'obsolete';d20:number|null;total:number|null;replayed:boolean}
export const CONCENTRATION_ROLL_CHANGED='dndkeep:concentration-roll-changed';
const prefix=(id:string)=>`dndkeep:concentration-roll:${id}:`;
const active=new Map<string,Promise<ConcentrationReceipt>>();
const die=(n:unknown)=>Number.isInteger(n)&&Number(n)>=1&&Number(n)<=20;
function valid(v:unknown):v is SavedConcentrationRoll{
 if(!v||typeof v!=='object')return false;
 const r=v as Partial<SavedConcentrationRoll>;
 return typeof r.characterId==='string'&&!!r.characterId&&typeof r.pendingId==='string'&&!!r.pendingId&&die(r.d20)&&(r.source==='player'||r.source==='timeout');
}
function changed(){window.dispatchEvent(new Event(CONCENTRATION_ROLL_CHANGED));}
export function savedConcentrationRolls(characterId:string):SavedConcentrationRoll[]{
 const result:SavedConcentrationRoll[]=[];
 try{for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);if(!key?.startsWith(prefix(characterId)))continue;
  try{const value:unknown=JSON.parse(localStorage.getItem(key)??'null');if(valid(value)&&key===prefix(value.characterId)+value.pendingId)result.push(value);}catch{/* malformed storage is never sent */}
 }}catch{/* writes are blocked below when storage is unavailable */}
 return result;
}
function verify(value:unknown,pendingId:string):asserts value is ConcentrationReceipt{
 const r=value as Partial<ConcentrationReceipt>|null;
 if(!r||r.pendingId!==pendingId||typeof r.replayed!=='boolean'||
  (r.outcome==='obsolete'?r.d20!==null||r.total!==null:
   !['passed','failed'].includes(r.outcome??'')||!die(r.d20)||!Number.isSafeInteger(r.total)))
  throw new Error('The concentration result could not be verified. Keep the saved roll and confirm again.');
}
async function settle(characterId:string,pendingId:string,source:ConcentrationResolutionSource):Promise<ConcentrationReceipt>{
 const key=prefix(characterId)+pendingId;
 const raw=localStorage.getItem(key);
 let request:SavedConcentrationRoll;
 if(raw!==null){
  let existing:unknown;try{existing=JSON.parse(raw);}catch{throw new Error('The saved concentration roll is unreadable. No new roll was sent.');}
  if(!valid(existing)||existing.characterId!==characterId||existing.pendingId!==pendingId)throw new Error('The saved concentration roll does not match this offer.');
  request=existing;
 }else{
  request={characterId,pendingId,source,d20:rollDie(20)};
  if(!valid(request))throw new Error('Invalid concentration request');
  // v2.786 — durable before network I/O: reload or a lost response must never
  // turn confirmation into a new roll. Server receipts may contain another
  // client's winning roll, which is authoritative for this shared offer.
  localStorage.setItem(key,JSON.stringify(request));changed();
 }
 for(let attempt=0;;attempt++){
  let data:unknown;
  try{
   const result=await (supabase as any).rpc('settle_pending_concentration_save',{p_pending_id:pendingId,p_d20:request.d20,p_source:request.source});
   if(result.error)throw result.error;data=result.data;
  }catch(error){
   const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
   if(attempt===0&&!['P0001','42501','22023','23505'].includes(code))continue;
   throw new Error(error instanceof Error?error.message:error&&typeof error==='object'&&'message' in error?String(error.message):'Concentration result not confirmed. Your original roll is saved.');
  }
  verify(data,pendingId);
  try{localStorage.removeItem(key);changed();}catch{/* leftover receipt confirmation is safe */}
  return data;
 }
}
/** One in-flight request per offer in this tab. Other tabs are serialized by
 * the server; a receipt is never reapplied as a client character/effect write. */
export function resolveConcentrationSave(characterId:string,pendingId:string,source:ConcentrationResolutionSource):Promise<ConcentrationReceipt>{
 const key=prefix(characterId)+pendingId,existing=active.get(key);if(existing)return existing;
 const pending=settle(characterId,pendingId,source).finally(()=>{active.delete(key);});active.set(key,pending);return pending;
}

export interface ConcentrationOfferInput {
 characterId:string;campaignId:string;encounterId:string|null;chainId:string;participantId:string;
 spell:string;revision:number;damage:number;dc:number;bonus:number;proficient:boolean;automatic:boolean;
}
export async function createConcentrationOffer(input:ConcentrationOfferInput):Promise<string>{
 if(!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('The concentration casting could not be verified. Reload the sheet.');
 const id=crypto.randomUUID(),now=Date.now();
 const {error}=await supabase.from('pending_concentration_saves').insert({
  id,campaign_id:input.campaignId,encounter_id:input.encounterId,chain_id:input.chainId,participant_id:input.participantId,
  character_id:input.characterId,spell_name:input.spell,concentration_revision:input.revision,damage:input.damage,dc:input.dc,
  con_bonus:input.bonus,has_con_prof:input.proficient,state:'offered',offered_at:new Date(now).toISOString(),
  expires_at:new Date(now+(input.automatic?0:120_000)).toISOString(),
 });
 if(error)throw new Error(error.message);return id;
}
