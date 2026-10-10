import {readCombatClockTransition,getCombatClockContext,commitCombatClock,validCombatClockReceipt,validCombatClockRequest,type CombatClockRequest,type CombatClockReceipt} from './combatClock';
/** A clock acknowledgement is not proof that start/end-of-turn effects ran.
 * Keep the saved request until the caller has explicitly finished its follow-up.
 * v2.869 audit: unknown post-clock work must never be blindly replayed. */
export interface SavedCombatTransition {
 version:1;userId:string;request:CombatClockRequest;
 stage:'clock-pending'|'clock-confirmed'|'clock-observed'|'effects-started';
 receipt:CombatClockReceipt|null;
}
const active=new Map<string,Promise<SavedCombatTransition>>();
const key=(user:string,encounter:string)=>`dndkeep:combat-transition:${user}:${encounter}`;
const invalid=()=>new Error('The saved turn transition could not be verified. Keep it for recovery; do not advance again.');
const same=(a:CombatClockRequest,b:CombatClockRequest)=>a.requestId===b.requestId&&a.encounterId===b.encounterId&&a.expectedTurn===b.expectedTurn&&a.incomingId===b.incomingId&&a.nextIndex===b.nextIndex&&a.nextRound===b.nextRound;
function verify(value:unknown,user:string,encounter:string):asserts value is SavedCombatTransition {
 const r=value as SavedCombatTransition|null;
 if(!r||r.version!==1||!user||r.userId!==user||!validCombatClockRequest(r.request)||r.request.encounterId!==encounter
  ||!['clock-pending','clock-confirmed','clock-observed','effects-started'].includes(r.stage)
  ||(r.stage==='clock-pending'?r.receipt!==null:r.stage==='clock-observed'?
   !r.receipt||r.receipt.requestId===r.request.requestId||!validCombatClockRequest({...r.request,requestId:r.receipt.requestId})
    ||!validCombatClockReceipt(r.receipt,{...r.request,requestId:r.receipt.requestId})||!r.receipt.replayed
   :!validCombatClockReceipt(r.receipt,r.request)))throw invalid();
}
export function savedCombatTransition(user:string,encounter:string):SavedCombatTransition|null {
 const raw=localStorage.getItem(key(user,encounter));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw invalid();}verify(value,user,encounter);return value;
}
function store(r:SavedCombatTransition){verify(r,r.userId,r.request.encounterId);localStorage.setItem(key(r.userId,r.request.encounterId),JSON.stringify(r));}
/** Call only after prior-turn work has finished. Never replace an unresolved request. */
export function saveCombatTransition(user:string,request:CombatClockRequest):SavedCombatTransition {
 if(!validCombatClockRequest(request)||!user)throw invalid();
 const old=savedCombatTransition(user,request.encounterId);
 if(old){if(!same(old.request,request))throw new Error('Finish the saved turn transition before advancing again.');return old;}
 const r:SavedCombatTransition={version:1,userId:user,request:structuredClone(request),stage:'clock-pending',receipt:null};store(r);return r;
}
export function confirmCombatTransition(user:string,encounter:string):Promise<SavedCombatTransition>{
 const k=key(user,encounter),pending=active.get(k);if(pending)return pending;
 const work=(async()=>{
  const r=savedCombatTransition(user,encounter);if(!r)throw invalid();
  if(r.stage!=='clock-pending')return r;
  const receipt=await readCombatClockTransition(r.request)??await commitCombatClock(r.request);
  // Another tab may have progressed while this acknowledgement was in flight.
  const current=savedCombatTransition(user,encounter);
  if(!current||!same(current.request,r.request))throw invalid();
  if(current.stage!=='clock-pending')return current;
  const confirmed:SavedCombatTransition={...r,stage:receipt.requestId===r.request.requestId?'clock-confirmed':'clock-observed',receipt};store(confirmed);return confirmed;
 })();active.set(k,work);void work.finally(()=>{if(active.get(k)===work)active.delete(k);}).catch(()=>{});return work;
}
/** Mark before invoking side effects. A reload at this stage is an unknown
 * outcome needing reconciliation, not permission to invoke effects again. */
export function beginCombatTransitionEffects(user:string,encounter:string,requestId:string):SavedCombatTransition {
 const r=savedCombatTransition(user,encounter);
 if(!r||r.request.requestId!==requestId||r.stage==='clock-pending')throw invalid();
 if(r.stage==='clock-observed')throw new Error('Another request advanced this turn. Reconcile its incoming effects before continuing.');
 if(r.stage==='effects-started')throw new Error('This turn may already have applied its effects. Reconcile them before continuing.');
 const started:SavedCombatTransition={...r,stage:'effects-started'};store(started);return started;
}
/** Caller must have verified completion of all post-clock work. No timeout or
 * failed acknowledgement should call this; retain the journal instead. */
export function finishCombatTransition(user:string,encounter:string,requestId:string):void {
 const r=savedCombatTransition(user,encounter);
 if(!r||r.request.requestId!==requestId||r.stage!=='effects-started')throw invalid();
 localStorage.removeItem(key(user,encounter));
}

const preparing=new Map<string,Promise<SavedCombatTransition>>();
/** v2.869: after outgoing work finishes, obtain and persist the authoritative
 * successor before sending any clock mutation. Existing work always wins over
 * a fresh proposal. The guard prevents an asynchronous response crossing users
 * or UI scopes; it must not require a recovered old turn to remain current. */
export function prepareCombatTransition(user:string,encounter:string,turn:string,assertCurrentScope:()=>void):Promise<SavedCombatTransition>{
 assertCurrentScope();const k=key(user,encounter),pending=preparing.get(k);if(pending)return pending;
 const work=(async()=>{
  const old=savedCombatTransition(user,encounter);if(old)return old;
  const context=await getCombatClockContext(user,encounter,turn);
  assertCurrentScope();
  const existing=savedCombatTransition(user,encounter);if(existing)return existing;
  return saveCombatTransition(user,{requestId:crypto.randomUUID(),encounterId:context.encounterId,
   expectedTurn:context.expectedTurn,incomingId:context.incomingId,nextIndex:context.nextIndex,nextRound:context.nextRound});
 })();preparing.set(k,work);void work.finally(()=>{if(preparing.get(k)===work)preparing.delete(k);}).catch(()=>{});return work;
}
