import {planTurnTicks,type TickingBuff,type TurnTick} from '../../rules/turnTicks';
import {psionicRpc} from './psionicTurns';
export interface TurnEffectIdentity {participantId:string;encounterId:string;turnId:string;timing:'turn_start'|'turn_end'}
export interface TurnEffectState {current_hp:number;max_hp:number;temp_hp:number;death_save_failures:number;death_save_successes:number;is_stable:boolean;is_dead:boolean;active_buffs:Record<string,unknown>[]|null}
export type TurnEffectUpdates=Omit<TurnEffectState,'max_hp'|'active_buffs'>&{active_buffs:Record<string,unknown>[]};
export interface TurnEffectPlan {combatantId:string;expected:TurnEffectState;updates:TurnEffectUpdates;events:{eventType:string;payload:Record<string,unknown>}[]}
export interface TurnEffectRequest extends TurnEffectIdentity,TurnEffectPlan {version:1;userId:string;requestId:string}
export interface TurnEffectReceipt extends TurnEffectIdentity {requestId:string;combatantId:string;state:TurnEffectState;eventCount:number;replayed:boolean}
export const TURN_EFFECT_CHANGED='dndkeep:turn-effect-changed';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown,max=2147483647):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identity=(v:TurnEffectIdentity)=>!!v&&uuid(v.participantId)&&uuid(v.encounterId)&&uuid(v.turnId)&&['turn_start','turn_end'].includes(v.timing);
const same=(a:TurnEffectIdentity,b:TurnEffectIdentity)=>a.participantId===b.participantId&&a.encounterId===b.encounterId&&a.turnId===b.turnId&&a.timing===b.timing;
const fields=['current_hp','temp_hp','death_save_failures','death_save_successes','is_stable','is_dead','active_buffs'];
const state=(v:TurnEffectState)=>!!v&&[v.current_hp,v.max_hp,v.temp_hp].every(n=>count(n))&&v.current_hp<=v.max_hp
 &&count(v.death_save_failures,3)&&count(v.death_save_successes,3)&&typeof v.is_stable==='boolean'&&typeof v.is_dead==='boolean'
 &&(v.active_buffs===null||Array.isArray(v.active_buffs)&&v.active_buffs.every(object));
const eventTypes=['damage_applied','damage_at_0_hp_failure_added','healing_applied','temp_hp_gained','spell_effect_removed','save_requested'];
const invalid=()=>new Error('The saved turn effects could not be verified. Keep the request and review it before advancing.');
function validRequest(v:unknown):v is TurnEffectRequest {
 const r=v as TurnEffectRequest|null;
 return !!r&&r.version===1&&identity(r)&&uuid(r.userId)&&uuid(r.requestId)&&uuid(r.combatantId)&&state(r.expected)
  &&object(r.updates)&&Object.keys(r.updates).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(r.updates,k))
  &&Array.isArray(r.updates.active_buffs)&&state({...r.updates,max_hp:r.expected.max_hp})
  &&Array.isArray(r.events)&&r.events.length<=100&&r.events.every(e=>object(e)&&eventTypes.includes(e.eventType)&&object(e.payload));
}
const prefix=(user:string,encounter:string)=>`dndkeep:turn-effects:${user}:${encounter}:`;
const key=(user:string,i:TurnEffectIdentity)=>prefix(user,i.encounterId)+`${i.participantId}:${i.turnId}:${i.timing}`;
const changed=()=>window.dispatchEvent(new Event(TURN_EFFECT_CHANGED));
function forget(user:string,i:TurnEffectIdentity){
 // A committed receipt stays authoritative even if browser cleanup fails.
 try{localStorage.removeItem(key(user,i));}catch{/* Recovery reads the receipt again. */}changed();
}
export function savedTurnEffect(user:string,i:TurnEffectIdentity):TurnEffectRequest|null{
 if(!uuid(user)||!identity(i))throw invalid();
 const raw=localStorage.getItem(key(user,i));if(raw===null)return null;
 let r:unknown;try{r=JSON.parse(raw);}catch{throw invalid();}
 if(!validRequest(r)||r.userId!==user||!same(r,i))throw invalid();return r;
}
export function savedTurnEffects(user:string,encounter:string):TurnEffectRequest[]{
 if(!uuid(user)||!uuid(encounter))throw invalid();const rows:TurnEffectRequest[]=[];
 for(let n=0;n<localStorage.length;n++){
  const k=localStorage.key(n);if(!k?.startsWith(prefix(user,encounter)))continue;
  let r:unknown;try{r=JSON.parse(localStorage.getItem(k)??'null');}catch{throw invalid();}
  if(!validRequest(r)||r.userId!==user||r.encounterId!==encounter||key(user,r)!==k)throw invalid();rows.push(r);
 }
 return rows;
}
function verifyReceipt(value:unknown,i:TurnEffectIdentity):TurnEffectReceipt{
 const r=value as TurnEffectReceipt|null;
 if(!r||!same(r,i)||!uuid(r.requestId)||!uuid(r.combatantId)||!state(r.state)||!count(r.eventCount,100)||typeof r.replayed!=='boolean')throw invalid();return r;
}
const args=(i:TurnEffectIdentity)=>({p_participant:i.participantId,p_turn:i.turnId,p_timing:i.timing});
export async function readTurnEffect(i:TurnEffectIdentity):Promise<TurnEffectReceipt|null>{
 if(!identity(i))throw invalid();const r=await psionicRpc('read_turn_effect_batch',args(i),true);return r===null?null:verifyReceipt(r,i);
}
function equal(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((x,n)=>equal(x,b[n]));
 if(object(a)&&object(b))return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k]));return false;
}
async function submit(r:TurnEffectRequest){
 const value=await psionicRpc('commit_turn_effect_batch',{...args(r),p_request:r.requestId,p_expected:r.expected,p_updates:r.updates,p_events:r.events},true);
 const receipt=verifyReceipt(value,r);
 if(receipt.requestId!==r.requestId||receipt.combatantId!==r.combatantId||receipt.eventCount!==r.events.length
  ||!equal(receipt.state,{...r.updates,max_hp:r.expected.max_hp}))throw invalid();
 forget(r.userId,r);return receipt;
}
const active=new Map<string,Promise<TurnEffectReceipt>>();
/** v2.869: read the authoritative batch before preparing any dice. A recovered
 * receipt describes the original event, NOT current HP for a client-store patch.
 * The callback must verify fresh turn/context and the current UI scope itself. */
export function runTurnEffects(user:string,input:TurnEffectIdentity,prepare:()=>Promise<TurnEffectPlan>):Promise<TurnEffectReceipt>{
 if(!uuid(user)||!identity(input))return Promise.reject(invalid());
 const i=structuredClone(input),k=key(user,i),existing=active.get(k);if(existing)return existing;
 const work=(async()=>{
  const receipt=await readTurnEffect(i);
  if(receipt){forget(user,i);return receipt;}
  let request=savedTurnEffect(user,i);
  if(!request){
   // Probe storage before preparing effect dice; blocked storage must not roll.
   const probe='dndkeep:storage-probe:'+crypto.randomUUID();localStorage.setItem(probe,'1');localStorage.removeItem(probe);
   const plan=await prepare();
   // Another tab may have persisted while the fresh context was loading.
   request=savedTurnEffect(user,i);
   if(!request){
    request={...structuredClone(plan),...i,version:1,userId:user,requestId:crypto.randomUUID()};
    if(!validRequest(request))throw invalid();localStorage.setItem(k,JSON.stringify(request));changed();
   }
  }
  return submit(request);
 })();active.set(k,work);void work.finally(()=>{if(active.get(k)===work)active.delete(k);}).catch(()=>{});return work;
}

interface TurnEffectContext extends TurnEffectIdentity {
 userId:string;combatantId:string;isCharacter:boolean;state:TurnEffectState;
}
function tickingBuff(value:Record<string,unknown>):value is Record<string,unknown>&TickingBuff {
 if(typeof value.key!=='string'||typeof value.name!=='string')return false;
 if(value.turnTick===undefined)return true;
 const t=value.turnTick as TurnTick;
 return object(t)&&['damage','heal','temp_hp'].includes(t.kind)&&['turn_start','turn_end'].includes(t.timing)
  &&(t.dice===undefined||typeof t.dice==='string'&&t.dice.trim().length>0)
  &&(t.flat===undefined||Number.isSafeInteger(t.flat))
  &&(t.oneShot===undefined||typeof t.oneShot==='boolean')
  &&(t.damageType===undefined||typeof t.damageType==='string')
  &&(t.saveEnds===undefined||object(t.saveEnds)&&typeof t.saveEnds.ability==='string'&&count(t.saveEnds.dc));
}
/** v2.869: prepare from one authorized server snapshot, only after recovery has
 * found no saved result/proposal. The scope guard checks the signed-in UI owner;
 * do not require an old turn to remain current when recovering its receipt.
 * Returned HP is historical: refresh live state instead of patching it back. */
export function processSavedTurnEffects(user:string,input:TurnEffectIdentity,assertCurrentScope:()=>void):Promise<TurnEffectReceipt>{
 const i=structuredClone(input);
 assertCurrentScope();
 return runTurnEffects(user,i,async()=>{
  assertCurrentScope();
  const value=await psionicRpc('get_turn_effect_context',{...args(i),p_encounter:i.encounterId},true);
  assertCurrentScope();
  const c=value as TurnEffectContext|null;
  if(!c||!same(c,i)||c.userId!==user||!uuid(c.combatantId)||typeof c.isCharacter!=='boolean'||!state(c.state)
   ||c.state.active_buffs?.some(b=>!tickingBuff(b)))throw invalid();
  const {updates,events}=planTurnTicks({...c.state,active_buffs:c.state.active_buffs as (Record<string,unknown>&TickingBuff)[]|null},c.isCharacter,i.timing);
  return {combatantId:c.combatantId,expected:c.state,updates,events};
 });
}
