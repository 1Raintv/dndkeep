import {supabase} from '../supabase';
import {applyDamageToPools,parseHitPointAdjustment,type HitPointAdjustmentMode} from '../../rules/hp';
export interface HitPointSnapshot {id:string;current_hp:number;max_hp:number;temp_hp:number;hit_point_revision:number}
export interface HitPointAdjustmentRequest {requestId:string;characterId:string;userId:string;mode:HitPointAdjustmentMode;amount:number;expectedRevision:number}
export interface HitPointAdjustmentReceipt {requestId:string;mode:HitPointAdjustmentMode;amount:number;beforeHP:number;beforeTempHP:number;afterHP:number;afterTempHP:number;character:HitPointSnapshot;replayed:boolean}
export const HIT_POINT_ADJUSTMENT_CHANGED='dndkeep:hp-adjustment-changed';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const key=(user:string,character:string)=>`dndkeep:hp-adjustment:${user}:${character}`;
const active=new Map<string,{serialized:string;promise:Promise<HitPointAdjustmentReceipt>}>();
const notify=()=>window.dispatchEvent(new Event(HIT_POINT_ADJUSTMENT_CHANGED));
export function validHitPointAdjustment(value:unknown):value is HitPointAdjustmentRequest {
 if(!value||typeof value!=='object')return false;const r=value as HitPointAdjustmentRequest;
 return uuid(r.requestId)&&uuid(r.characterId)&&uuid(r.userId)&&['damage','heal','set'].includes(r.mode)&&count(r.expectedRevision)
  &&typeof r.amount==='number'&&parseHitPointAdjustment(String(r.amount),r.mode)===r.amount;
}
function snapshot(value:unknown,id:string):HitPointSnapshot {
 const c=value as HitPointSnapshot|null;
 if(!c||c.id!==id||![c.current_hp,c.max_hp,c.temp_hp,c.hit_point_revision].every(count))throw new Error('Current HP could not be verified. Reload before making changes.');
 return {id:c.id,current_hp:c.current_hp,max_hp:c.max_hp,temp_hp:c.temp_hp,hit_point_revision:c.hit_point_revision};
}
export async function loadHitPointSnapshot(characterId:string):Promise<HitPointSnapshot>{
 const {data,error}=await supabase.from('characters').select('id,current_hp,max_hp,temp_hp,hit_point_revision').eq('id',characterId).single();
 if(error)throw new Error(error.message);return snapshot(data,characterId);
}
export function savedHitPointAdjustment(userId:string,characterId:string):HitPointAdjustmentRequest|null {
 const raw=localStorage.getItem(key(userId,characterId));if(raw===null)return null;
 let r:unknown;try{r=JSON.parse(raw);}catch{throw new Error('The saved HP adjustment is unreadable.');}
 if(!validHitPointAdjustment(r)||r.userId!==userId||r.characterId!==characterId)throw new Error('The saved HP adjustment does not match this character.');return r;
}
function forget(r:HitPointAdjustmentRequest,canceled=false){
 const k=key(r.userId,r.characterId),stored=savedHitPointAdjustment(r.userId,r.characterId);
 if(stored&&JSON.stringify(stored)!==JSON.stringify(r))throw new Error('A newer HP adjustment is pending.');
 if(!canceled&&active.has(k))throw new Error('Wait for HP confirmation.');
 if(canceled&&active.get(k)?.serialized===JSON.stringify(r))active.delete(k);
 if(stored){localStorage.removeItem(k);notify();}
}
export const acknowledgeHitPointAdjustment=(r:HitPointAdjustmentRequest)=>forget(r);
const client=supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
const args=(r:HitPointAdjustmentRequest)=>({p_character_id:r.characterId,p_request_id:r.requestId,p_mode:r.mode,p_amount:r.amount,p_expected_revision:r.expectedRevision});
async function rpc(name:string,r:HitPointAdjustmentRequest){
 for(let attempt=0;;attempt++)try{const result=await client.rpc(name,args(r));if(result.error)throw result.error;return result.data;}
 catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
  if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
  throw new Error(error&&typeof error==='object'&&'message' in error?String(error.message):'HP confirmation failed. Keep the saved adjustment.');}
}
/** v2.806: one disk-backed identity, no optimistic HP write, no fresh retry ID. */
export function submitHitPointAdjustment(input:HitPointAdjustmentRequest):Promise<HitPointAdjustmentReceipt>{
 if(!validHitPointAdjustment(input))throw new Error('Invalid HP adjustment.');const r={...input},k=key(r.userId,r.characterId),serialized=JSON.stringify(r);
 const stored=savedHitPointAdjustment(r.userId,r.characterId);
 if(stored&&JSON.stringify(stored)!==serialized)throw new Error('Confirm the saved HP adjustment first.');
 if(!stored){localStorage.setItem(k,serialized);notify();}
 const running=active.get(k);if(running){if(running.serialized!==serialized)throw new Error('Another HP adjustment is being confirmed.');return running.promise;}
 const promise:Promise<HitPointAdjustmentReceipt>=(async()=>{
  const data=await rpc('adjust_character_hit_points_atomic',r),v=data as HitPointAdjustmentReceipt|null;
  if(!v||v.requestId!==r.requestId||v.mode!==r.mode||v.amount!==r.amount||typeof v.replayed!=='boolean'
   ||![v.beforeHP,v.beforeTempHP,v.afterHP,v.afterTempHP].every(count))throw new Error('The HP adjustment receipt could not be verified.');
  const c=snapshot(v.character,r.characterId),damage=applyDamageToPools(v.beforeHP,v.beforeTempHP,r.amount);
  const valid=r.mode==='damage'?v.afterHP===damage.hpAfter&&v.afterTempHP===damage.tempAfter:
   v.afterTempHP===v.beforeTempHP&&(r.mode==='set'?v.afterHP<=r.amount:v.afterHP>=v.beforeHP&&v.afterHP-v.beforeHP<=r.amount);
  if(!valid||c.hit_point_revision<r.expectedRevision)throw new Error('The HP adjustment receipt could not be verified.');
  return {...v,character:c};
 })().finally(()=>{if(active.get(k)?.promise===promise)active.delete(k);});active.set(k,{serialized,promise});return promise;
}
export async function cancelHitPointAdjustment(input:HitPointAdjustmentRequest):Promise<boolean>{
 if(!validHitPointAdjustment(input))throw new Error('Invalid HP adjustment.');const r={...input};
 const value=await rpc('cancel_hit_point_adjustment_atomic',r),v=value as {requestId?:string;characterId?:string;canceled?:boolean;replayed?:boolean}|null;
 if(!v||v.requestId!==r.requestId||v.characterId!==r.characterId||typeof v.canceled!=='boolean'||typeof v.replayed!=='boolean')throw new Error('The HP cancellation receipt could not be verified.');
 if(v.canceled)forget(r,true);return v.canceled;
}
