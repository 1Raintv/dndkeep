import {supabase} from '../supabase';
export interface MapConditionRequest {requestId:string;userId:string;campaignId:string;targetType:'character'|'combatant';targetId:string;condition:string;present:boolean}
export interface MapConditionReceipt {requestId:string;condition:string;present:boolean;canceled:boolean;replayed:boolean;conditionPresent?:boolean;blocked?:boolean;concentrationEnded?:boolean}
export const MAP_CONDITION_CHANGED='dndkeep:map-condition-changed';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const key=(r:Pick<MapConditionRequest,'userId'|'campaignId'|'targetType'|'targetId'>)=>`dndkeep:map-condition:${r.userId}:${r.campaignId}:${r.targetType}:${r.targetId}`;
const valid=(r:MapConditionRequest)=>!!r&&[r.requestId,r.userId,r.campaignId,r.targetId].every(uuid)&&['character','combatant'].includes(r.targetType)&&typeof r.condition==='string'&&r.condition.length>0&&typeof r.present==='boolean';
const notify=()=>window.dispatchEvent(new Event(MAP_CONDITION_CHANGED));
export function savedMapCondition(scope:Pick<MapConditionRequest,'userId'|'campaignId'|'targetType'|'targetId'>):MapConditionRequest|null {
 const raw=localStorage.getItem(key(scope));if(raw===null)return null;
 let r:MapConditionRequest;try{r=JSON.parse(raw);}catch{throw new Error('Saved condition change is unreadable.');}
 if(!valid(r)||key(r)!==key(scope))throw new Error('Saved condition change does not match this target.');return r;
}
export function acknowledgeMapCondition(r:MapConditionRequest){
 const saved=savedMapCondition(r);
 if(saved&&JSON.stringify(saved)!==JSON.stringify(r))throw new Error('A newer condition change is pending.');
 if(saved){localStorage.removeItem(key(r));notify();}
}
const client=supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
/** v2.860: persist intent before the RPC; retry and cancellation use that same identity.
 * Receipts intentionally contain no condition snapshot to overwrite newer realtime state. */
export async function submitMapCondition(input:MapConditionRequest,cancel=false):Promise<MapConditionReceipt>{
 const r={...input};if(!valid(r))throw new Error('Invalid condition change.');
 const saved=savedMapCondition(r);
 if(saved&&JSON.stringify(saved)!==JSON.stringify(r))throw new Error('Confirm the saved condition change first.');
 if(!saved){localStorage.setItem(key(r),JSON.stringify(r));notify();}
 for(let attempt=0;;attempt++){
  let data:unknown;
  try{
   const result=await client.rpc('change_map_condition_atomic',{p_campaign_id:r.campaignId,p_target_type:r.targetType,p_target_id:r.targetId,p_request_id:r.requestId,p_condition:r.condition,p_present:r.present,p_cancel:cancel});
   if(result.error)throw result.error;data=result.data;
  }catch(e){
   const code=e&&typeof e==='object'&&'code' in e?String(e.code):'';
   if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
   throw new Error(!code?'Connection interrupted. Retry the saved condition change to confirm it.':e&&typeof e==='object'&&'message' in e?String(e.message):'Condition change is unconfirmed. Retry the saved change.');
  }
  const v=data as MapConditionReceipt|null;
  if(!v||v.requestId!==r.requestId||v.condition!==r.condition||v.present!==r.present||typeof v.canceled!=='boolean'||typeof v.replayed!=='boolean'
   ||(!v.canceled&&[v.conditionPresent,v.blocked,v.concentrationEnded].some(x=>typeof x!=='boolean')))
   throw new Error('Condition receipt could not be verified. Keep the saved change.');
  return v;
 }
}
