import {supabase} from '../supabase';
import {rollDie} from '../../rules/dice';
export type ConcentrationResolutionSource='player'|'timeout';
export interface SavedConcentrationRoll {characterId:string;pendingId:string;d20:number;source:ConcentrationResolutionSource;advantage?:boolean;secondD20?:number}
export interface ConcentrationReceipt {pendingId:string;outcome:'passed'|'failed'|'obsolete';d20:number|null;total:number|null;replayed:boolean;rolls?:number[]|null;advantage?:boolean}
export const CONCENTRATION_ROLL_CHANGED='dndkeep:concentration-roll-changed';
const prefix=(id:string)=>`dndkeep:concentration-roll:${id}:`;
const active=new Map<string,Promise<ConcentrationReceipt>>();
const die=(n:unknown)=>Number.isInteger(n)&&Number(n)>=1&&Number(n)<=20;
function valid(v:unknown):v is SavedConcentrationRoll{
 if(!v||typeof v!=='object')return false;
 const r=v as Partial<SavedConcentrationRoll>;
 return typeof r.characterId==='string'&&!!r.characterId&&typeof r.pendingId==='string'&&!!r.pendingId&&die(r.d20)&&(r.source==='player'||r.source==='timeout')
  &&(r.advantage===undefined?r.secondD20===undefined:typeof r.advantage==='boolean'&&(r.advantage?die(r.secondD20):r.secondD20===undefined));
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
 if(r.rolls!=null&&(!Array.isArray(r.rolls)||r.rolls.length!==(r.advantage?2:1)||!r.rolls.every(die)||r.d20!==Math.max(...r.rolls)))
  throw new Error('The concentration dice could not be verified. Keep the saved roll and confirm again.');
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
  request={characterId,pendingId,source,d20:0}; // no dice until the offer is readable
 }
 if(request.advantage===undefined){
  // v2.808 — eligibility belongs to the damage-time offer, not current feats.
  // Upgrade an older saved first die without rerolling it. Store the pair before
  // any settlement call so reloads, timeout and network retries share both dice.
  const {data,error}=await supabase.from('pending_concentration_saves').select('id,character_id,has_advantage').eq('id',pendingId).single();
  const context=data as unknown as {id:string;character_id:string;has_advantage:boolean}|null;
  if(error)throw error;
  if(!context||context.id!==pendingId||context.character_id!==characterId||typeof context.has_advantage!=='boolean')
   throw new Error('The concentration roll settings could not be verified. No new roll was sent.');
  request={...request,d20:raw===null?rollDie(20):request.d20,advantage:context.has_advantage,
   ...(context.has_advantage?{secondD20:rollDie(20)}:{})};
  if(!valid(request))throw new Error('Invalid concentration request');
  localStorage.setItem(key,JSON.stringify(request));changed();
 }
 for(let attempt=0;;attempt++){
  let data:unknown;
  try{
   const result=await (supabase as any).rpc('settle_pending_concentration_save',{p_pending_id:pendingId,p_d20:request.d20,p_source:request.source,...(request.advantage?{p_second_d20:request.secondD20}:{})});
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
 characterId:string;campaignId:string;encounterId:string|null;chainId:string;participantId:string|null;
 spell:string;revision:number;damage:number;dc:number;bonus:number;proficient:boolean;automatic:boolean;
}
export async function createConcentrationOffer(input:ConcentrationOfferInput):Promise<string>{
 if(input.participantId===null&&input.encounterId!==null)throw new Error('An encounter save requires a combat participant.');
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

/** Read an already-settled save without generating a new proposed roll. */
export async function readConcentrationResult(characterId:string,pendingId:string):Promise<ConcentrationReceipt|null>{
 const {data,error}=await supabase.from('pending_concentration_saves').select('id,character_id,state,d20,total,result,resolution_outcome,has_advantage,d20_rolls').eq('id',pendingId).single();
 if(error)throw new Error(error.message);
 const row=data as unknown as {id:string;character_id:string;state:string;d20:number|null;total:number|null;result:string|null;resolution_outcome:string|null;has_advantage:boolean;d20_rolls:number[]|null}|null;
 if(!row||row.id!==pendingId||row.character_id!==characterId||!['offered','resolved','expired'].includes(row.state))throw new Error('The concentration result could not be verified.');
 if(row.state==='offered')return null;
 const receipt={pendingId,outcome:row.resolution_outcome??row.result??'obsolete',d20:row.d20,total:row.total,replayed:true,advantage:row.has_advantage,rolls:row.d20_rolls};
 verify(receipt,pendingId);
 try{localStorage.removeItem(prefix(characterId)+pendingId);changed();}catch{/* A leftover saved roll can still confirm the immutable result. */}
 return receipt;
}
