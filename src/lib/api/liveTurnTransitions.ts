import {supabase} from '../supabase';
import {psionicRpc} from './psionicTurns';
import {getCombatClockContext,validCombatClockRequest,validCombatClockReceipt,type CombatClockRequest,type CombatClockReceipt} from './combatClock';
import {processSavedTurnEffects} from './turnEffects';
import {processSavedTurnRecharge} from './turnRecharges';
import {createPendingDeathSave,resolveAutomaticDeathSave} from '../deathSaves';
interface Actor {id:string;name:string;type:string;hidden:boolean;characterId?:string|null;round?:number}
export interface LiveTurnTransition {requestId:string;encounterId:string;campaignId:string;expectedTurn:string;clock:CombatClockReceipt;outgoing:Actor;incoming:Actor;deathRequired:boolean;deathMode:'off'|'prompt'|'auto';lairActions:number;complete:boolean;deathComplete:boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const actor=(v:Actor)=>v&&uuid(v.id)&&typeof v.name==='string'&&['character','creature','monster','npc'].includes(v.type)&&typeof v.hidden==='boolean';
const invalid=()=>new Error('The saved combat turn could not be verified. Keep it for recovery before advancing.');
const key=(user:string,encounter:string)=>`dndkeep:live-turn:${user}:${encounter}`;
function verify(value:unknown,encounter:string,request?:CombatClockRequest):LiveTurnTransition {
 const r=value as LiveTurnTransition|null;
 if(!r||r.encounterId!==encounter||!uuid(r.requestId)||!uuid(r.campaignId)||!uuid(r.expectedTurn)||!actor(r.outgoing)||!actor(r.incoming)
  ||!count(r.outgoing.round)||!count(r.lairActions)||typeof r.complete!=='boolean'||typeof r.deathComplete!=='boolean'||r.complete&&!r.deathComplete
  ||typeof r.deathRequired!=='boolean'||r.deathRequired&&r.incoming.type!=='character'||!['off','prompt','auto'].includes(r.deathMode)||r.incoming.type==='character'&&!uuid(r.incoming.characterId)
  ||!validCombatClockRequest({requestId:r.requestId,encounterId:encounter,expectedTurn:r.expectedTurn,incomingId:r.incoming.id,nextIndex:r.clock?.index,nextRound:r.clock?.round})
  ||!validCombatClockReceipt(r.clock,{requestId:r.requestId,encounterId:encounter,expectedTurn:r.expectedTurn,incomingId:r.incoming.id,nextIndex:r.clock.index,nextRound:r.clock.round})
  ||request&&(request.expectedTurn!==r.expectedTurn||request.incomingId!==r.incoming.id||request.nextIndex!==r.clock.index||request.nextRound!==r.clock.round))throw invalid();
 return r;
}
function saved(user:string,encounter:string):CombatClockRequest|null{
 const raw=localStorage.getItem(key(user,encounter));if(raw===null)return null;
 let r:unknown;try{r=JSON.parse(raw);}catch{throw invalid();}
 if(!validCombatClockRequest(r)||r.encounterId!==encounter)throw invalid();return r;
}
function forget(user:string,encounter:string){try{localStorage.removeItem(key(user,encounter));}catch{/* Completion is recorded on the server; next click recovers it. */}}
async function continueIncoming(user:string,initial:LiveTurnTransition,guard:()=>void):Promise<void>{
 let r=initial;const args={p_encounter:r.encounterId,p_request:r.requestId};
 const update=(value:unknown)=>{
  const next=verify(value,initial.encounterId,{requestId:initial.requestId,encounterId:initial.encounterId,expectedTurn:initial.expectedTurn,incomingId:initial.incoming.id,nextIndex:initial.clock.index,nextRound:initial.clock.round});
  if(next.requestId!==initial.requestId||next.clock.turnId!==initial.clock.turnId||next.incoming.characterId!==initial.incoming.characterId||next.deathMode!==initial.deathMode||next.deathRequired!==initial.deathRequired)throw invalid();
  return next;
 };
 if(!r.complete){
  const identity={encounterId:r.encounterId,participantId:r.incoming.id,turnId:r.clock.turnId};
  guard();await processSavedTurnRecharge(user,identity,guard);guard();
  if(!r.deathComplete){
   if(r.deathRequired&&r.deathMode!=='off'){
    const input={...identity,campaignId:r.campaignId,characterId:r.incoming.characterId!};
    if(r.deathMode==='auto')await resolveAutomaticDeathSave(input);else await createPendingDeathSave(input);
    guard();
   }
   r=update(await psionicRpc('mark_live_turn_death_complete',args,true));guard();
   if(!r.deathComplete)throw invalid();
  }
  await processSavedTurnEffects(user,{...identity,timing:'turn_start'},guard);guard();
  r=update(await psionicRpc('finish_live_turn_transition',args,true));guard();
  if(!r.complete)throw invalid();
 }
 forget(user,r.encounterId);
}
async function begin(request:CombatClockRequest,guard:()=>void){
 guard();const r=await psionicRpc('begin_live_turn_transition',{p_encounter:request.encounterId,p_request:request.requestId,p_expected_turn:request.expectedTurn,p_incoming:request.incomingId,p_index:request.nextIndex,p_round:request.nextRound},true);guard();return verify(r,request.encounterId,request);
}
const sameRequest=(a:CombatClockRequest,b:CombatClockRequest)=>a.requestId===b.requestId&&a.encounterId===b.encounterId&&a.expectedTurn===b.expectedTurn&&a.incomingId===b.incomingId&&a.nextIndex===b.nextIndex&&a.nextRound===b.nextRound;
/** Server retirement blocks late submissions of the old proposal. Persist the
 * recorded replacement before sending it; a lost reply retains the predecessor. */
async function reconcile(user:string,request:CombatClockRequest,guard:()=>void,prepare=true):Promise<LiveTurnTransition|null>{
 const raw=await psionicRpc('reconcile_live_turn_request',{p_encounter:request.encounterId,p_original:request,p_prepare:prepare},true);guard();
 if(!raw||typeof raw!=='object')throw invalid();
 const value=raw as {status?:unknown;request?:unknown;original?:unknown;transition?:unknown};
 if(value.status==='committed'){
  const found=verify(value.transition,request.encounterId);
  if(found.expectedTurn!==request.expectedTurn)throw invalid();return found;
 }
 if(value.status==='uncommitted'&&!prepare)return null;
 if(!prepare)throw invalid();
 if(!validCombatClockRequest(value.request)||value.request.encounterId!==request.encounterId||value.request.expectedTurn!==request.expectedTurn)throw invalid();
 if(value.status==='ready'){
  if(!sameRequest(value.request,request))throw invalid();
 }else if(value.status==='replaced'){
  if(!validCombatClockRequest(value.original)||!sameRequest(value.original,request)||value.request.requestId===request.requestId)throw invalid();
  localStorage.setItem(key(user,request.encounterId),JSON.stringify(value.request));
 }else throw invalid();
 guard();return begin(value.request,guard);
}
/** Recover committed incoming work first. A stale uncommitted proposal can be
 * replaced only by the server, after pending movement has been reviewed. */
export async function recoverLiveTurnTransition(user:string,encounter:string,guard:()=>void,beforeBegin?:()=>Promise<void>):Promise<boolean>{
 guard();const request=saved(user,encounter);
 const found=await psionicRpc('read_live_turn_transition',{p_encounter:encounter,p_request:request?.requestId??null},true);guard();
 if(found===null&&!request)return false;
 let r=found===null?await reconcile(user,request!,guard,false):verify(found,encounter,request??undefined);
 if(!r){await beforeBegin?.();guard();r=await reconcile(user,request!,guard);}
 if(!r)throw invalid();
 await continueIncoming(user,r,guard);return true;
}
/** Outgoing work is finished. Persist the proposed boundary before sending it;
 * the server journals both the clock and unfinished incoming work atomically. */
export async function advanceLiveTurnTransition(user:string,encounter:string,turn:string,guard:()=>void):Promise<void>{
 guard();let request=saved(user,encounter);
 if(!request){
  const c=await getCombatClockContext(user,encounter,turn);guard();
  request={requestId:crypto.randomUUID(),encounterId:encounter,expectedTurn:turn,incomingId:c.incomingId,nextIndex:c.nextIndex,nextRound:c.nextRound};
  if(!validCombatClockRequest(request))throw invalid();localStorage.setItem(key(user,encounter),JSON.stringify(request));
 }
 await continueIncoming(user,await begin(request,guard),guard);
}
/** One signed-in owner across awaits. Server authorization remains independent. */
export async function withCurrentTurnUser<T>(work:(user:string,guard:()=>void)=>Promise<T>):Promise<T>{
 let user:string|null=null,observed:string|null|undefined,changed=false;
 const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{observed=session?.user.id??null;if(user!==null&&observed!==user)changed=true;});
 try{
  const {data:{session},error}=await supabase.auth.getSession();user=session?.user.id??null;
  const guard=()=>{if(error||!user||changed||observed!==undefined&&observed!==user)throw new Error('Sign-in changed. Sign in again before advancing combat.');};
  guard();return await work(user!,guard);
 }finally{subscription.unsubscribe();}
}
