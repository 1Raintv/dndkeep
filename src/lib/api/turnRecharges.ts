import {monsterRechargeRule,planMonsterRecharges,type RechargeAction,type RechargeRoll} from '../../rules/monsterRecharge';
import {rollDie} from '../../rules/dice';
import {psionicRpc} from './psionicTurns';
export interface RechargeIdentity {participantId:string;encounterId:string;turnId:string}
interface RechargeExpected {entityId:string|null;sourceId:string|null;expended:string[];actions:RechargeAction[]}
export interface RechargeRequest extends RechargeIdentity {version:1;userId:string;requestId:string;expected:RechargeExpected;rolls:Omit<RechargeRoll,'recharged'>[]}
export interface RechargeReceipt extends RechargeIdentity {requestId:string;remaining:string[];rolls:RechargeRoll[];eventCount:number;replayed:boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const names=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=100&&v.every(n=>typeof n==='string'&&!!n.trim())&&new Set(v).size===v.length;
const identity=(v:RechargeIdentity)=>!!v&&[v.participantId,v.encounterId,v.turnId].every(uuid);
const same=(a:RechargeIdentity,b:RechargeIdentity)=>a.participantId===b.participantId&&a.encounterId===b.encounterId&&a.turnId===b.turnId;
const die=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=6;
const invalid=()=>new Error('Saved recharge could not be verified. Keep the request and review it before advancing.');
const key=(user:string,i:RechargeIdentity)=>`dndkeep:turn-recharge:${user}:${i.encounterId}:${i.participantId}:${i.turnId}`;
function expected(v:RechargeExpected):boolean {
 return !!v&&(v.entityId===null||typeof v.entityId==='string')&&(v.sourceId===null||typeof v.sourceId==='string')&&names(v.expended)
  &&Array.isArray(v.actions)&&v.actions.every(a=>object(a)&&typeof a.name==='string'&&(a.usage==null||typeof a.usage==='string'));
}
function validRequest(v:unknown):v is RechargeRequest {
 const r=v as RechargeRequest|null;
 return !!r&&r.version===1&&identity(r)&&uuid(r.userId)&&uuid(r.requestId)&&expected(r.expected)&&Array.isArray(r.rolls)
  &&r.rolls.length===r.expected.expended.length&&r.rolls.every((x,n)=>{
   if(!object(x)||Object.keys(x).length!==4||x.name!==r.expected.expended[n]||!die(x.min)||!die(x.max)||!die(x.roll)||x.min>x.max)return false;
   const actions=r.expected.actions.filter(a=>a.name===x.name);if(actions.length!==1)return false;
   const rule=monsterRechargeRule(actions[0]);return rule.kind==='roll'&&rule.min===x.min&&rule.max===x.max;
  });
}
export function savedTurnRecharge(user:string,i:RechargeIdentity):RechargeRequest|null {
 if(!uuid(user)||!identity(i))throw invalid();const raw=localStorage.getItem(key(user,i));if(raw===null)return null;
 let r:unknown;try{r=JSON.parse(raw);}catch{throw invalid();}
 if(!validRequest(r)||r.userId!==user||!same(r,i))throw invalid();return r;
}
function receipt(v:unknown,i:RechargeIdentity):RechargeReceipt {
 const r=v as RechargeReceipt|null;
 if(!r||!same(r,i)||!uuid(r.requestId)||!names(r.remaining)||!Array.isArray(r.rolls)||r.rolls.length>100
  ||r.eventCount!==r.rolls.length||typeof r.replayed!=='boolean'||!names(r.rolls.map(x=>x?.name)))throw invalid();
 if(r.rolls.some(x=>!object(x)||!die(x.min)||!die(x.max)||!die(x.roll)||x.min>x.max||x.recharged!==(x.roll>=x.min&&x.roll<=x.max)))throw invalid();
 const remaining=r.rolls.filter(x=>!x.recharged).map(x=>x.name);
 if(JSON.stringify(remaining)!==JSON.stringify(r.remaining))throw invalid();return r;
}
function forget(user:string,i:RechargeIdentity){try{localStorage.removeItem(key(user,i));}catch{/* The server receipt is still authoritative. */}}
const active=new Map<string,Promise<RechargeReceipt>>();
/** v2.869: recover before preparing dice, persist before commit. A receipt is
 * historical; refresh live state instead of overwriting later resource spending.
 * The scope callback checks the signed-in owner, not whether an old turn is current. */
export function processSavedTurnRecharge(user:string,input:RechargeIdentity,assertCurrentScope:()=>void):Promise<RechargeReceipt>{
 assertCurrentScope();if(!uuid(user)||!identity(input))return Promise.reject(invalid());
 const i=structuredClone(input),k=key(user,i),pending=active.get(k);if(pending)return pending;
 const work=(async()=>{
  const args={p_participant:i.participantId,p_turn:i.turnId};
  const prior=await psionicRpc('read_turn_recharge_batch',args,true);assertCurrentScope();
  if(prior!==null){const r=receipt(prior,i);forget(user,i);return r;}
  let request=savedTurnRecharge(user,i);
  if(!request){
   const probe='dndkeep:storage-probe:'+crypto.randomUUID();localStorage.setItem(probe,'1');localStorage.removeItem(probe);
   const c=await psionicRpc('get_turn_recharge_context',{...args,p_encounter:i.encounterId},true) as RechargeIdentity&{userId:string;expected:RechargeExpected};
   assertCurrentScope();if(!c||!same(c,i)||c.userId!==user||!expected(c.expected))throw invalid();
   // Another tab may have saved while context loaded; do not roll its dice again.
   request=savedTurnRecharge(user,i);
   if(!request){
    const requestId=crypto.randomUUID();let preparing=false;
    const plan=planMonsterRecharges(c.expected.expended,c.expected.actions,()=>{
     // v2.869: a successful storage probe does not guarantee the later plan
     // fits. Persist an interruption marker BEFORE the first random result;
     // a failed final write must never make retry generate replacement dice.
     // The planner validates every action before invoking this callback.
     if(!preparing){
      assertCurrentScope();
      localStorage.setItem(k,JSON.stringify({...i,version:1,userId:user,requestId,phase:'preparing'}));
      preparing=true;
     }
     return rollDie(6);
    });
    request={...i,version:1,userId:user,requestId,expected:structuredClone(c.expected),
     rolls:plan.rolls.map(({name,min,max,roll})=>({name,min,max,roll}))};
    if(!validRequest(request))throw invalid();localStorage.setItem(k,JSON.stringify(request));
   }
  }
  assertCurrentScope();
  const r=receipt(await psionicRpc('commit_turn_recharge_batch',{...args,p_request:request.requestId,p_expected:request.expected,p_rolls:request.rolls},true),i);
  assertCurrentScope();
  if(r.requestId!==request.requestId||r.rolls.length!==request.rolls.length||r.rolls.some((x,n)=>{
   const y=request!.rolls[n];return x.name!==y.name||x.min!==y.min||x.max!==y.max||x.roll!==y.roll;
  }))throw invalid();forget(user,i);return r;
 })();active.set(k,work);void work.finally(()=>{if(active.get(k)===work)active.delete(k);}).catch(()=>{});return work;
}
