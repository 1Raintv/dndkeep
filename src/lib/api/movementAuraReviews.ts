import {psionicRpc} from './psionicTurns';
import {verifyMovementAuraEvents,type MovementAuraEvent} from './movementAuraEvents';
export interface MovementAuraCandidate {candidateId:string;originId:string;targetId:string;auraKey:string;originName:string;targetName:string;name:string;trigger:'creature_entered'|'emanation_entered';spec:Record<string,unknown>}
export interface MovementAuraReview {event:MovementAuraEvent;plan:{candidates:MovementAuraCandidate[];warnings:string[]}}
export interface MovementAuraDecision {candidateId:string;status:'resolved'|'not_triggered'|'manual';receiptId:string|null;reason:string|null}
export interface MovementAuraReviewReceipt {eventId:string;requestId:string;encounterId:string;turnId:string;decisions:MovementAuraDecision[];note:string;replayed:boolean}
interface SavedReview {version:1;userId:string;eventId:string;encounterId:string;turnId:string;requestId:string;decisions:MovementAuraDecision[];note:string}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const note=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>=3&&v.length<=2000;
const invalid=()=>new Error('Movement review could not be verified. Keep the original decision for review.');
function candidates(value:unknown):value is MovementAuraCandidate[]{
 if(!Array.isArray(value))return false;const ids=new Set<string>();
 return value.every(c=>{if(!object(c)||!uuid(c.originId)||!uuid(c.targetId)||c.originId===c.targetId||!text(c.auraKey)
  ||c.candidateId!==`${c.originId}:${c.targetId}:${c.auraKey}`||ids.has(c.candidateId)||![c.originName,c.targetName,c.name].every(text)
  ||!(c.trigger==='creature_entered'||c.trigger==='emanation_entered')||!object(c.spec)||c.spec.key!==c.auraKey)return false;
  ids.add(c.candidateId);return true;});
}
function decisions(value:unknown,plan:MovementAuraCandidate[]):value is MovementAuraDecision[]{
 return Array.isArray(value)&&value.length===plan.length&&value.every((d,i)=>object(d)&&Object.keys(d).length===4&&d.candidateId===plan[i].candidateId
  &&(d.status==='resolved'?uuid(d.receiptId)&&d.reason===null:(d.status==='not_triggered'||d.status==='manual')&&d.receiptId===null&&note(d.reason)));
}
/** Pending records are oldest-first. Failure is never an empty queue. */
export async function pendingMovementAuraReviews(encounterId:string,limit=25):Promise<MovementAuraReview[]>{
 if(!uuid(encounterId)||!Number.isInteger(limit)||limit<1||limit>100)throw invalid();
 const data:unknown=await psionicRpc('pending_movement_aura_reviews',{p_encounter:encounterId,p_limit:limit},true);
 if(!Array.isArray(data)||!data.every(object))throw invalid();
 const events=verifyMovementAuraEvents(data.map(r=>r.event),encounterId,null,limit,true);
 return data.map((r,i)=>{
  if(!object(r.plan)||!candidates(r.plan.candidates)||!Array.isArray(r.plan.warnings)||!r.plan.warnings.every(text))throw invalid();
  return {event:events[i],plan:{candidates:structuredClone(r.plan.candidates),warnings:[...r.plan.warnings]}};
 });
}
function receipt(value:unknown,review:MovementAuraReview,expected?:SavedReview):MovementAuraReviewReceipt{
 const r=value as MovementAuraReviewReceipt|null,e=review.event;
 if(!r||r.eventId!==e.id||r.encounterId!==e.encounterId||r.turnId!==e.turnId||!uuid(r.requestId)||typeof r.replayed!=='boolean'
  ||!decisions(r.decisions,review.plan.candidates)||!note(r.note))throw invalid();
 if(expected&&(r.requestId!==expected.requestId||r.note!==expected.note||r.decisions.some((d,i)=>{
  const prior=expected.decisions[i];return d.candidateId!==prior.candidateId||d.status!==prior.status||d.receiptId!==prior.receiptId||d.reason!==prior.reason;
 })))throw invalid();
 return r;
}
const key=(user:string,event:MovementAuraEvent)=>`dndkeep:movement-aura-review:${JSON.stringify([user,event.encounterId,event.id])}`;
const active=new Map<string,Promise<MovementAuraReviewReceipt>>();
/** Persist an entire reviewed decision before sending it. A retry always uses
 * that original request. Historical receipts never patch live HP or resources. */
export function finishMovementAuraReview(user:string,review:MovementAuraReview,choice:MovementAuraDecision[],ruling:string,guard:()=>void):Promise<MovementAuraReviewReceipt>{
 guard();if(!uuid(user)||!review||!candidates(review.plan?.candidates))return Promise.reject(invalid());
 verifyMovementAuraEvents([review.event],review.event.encounterId);
 const snapshot=structuredClone(review),e=snapshot.event,k=key(user,e),inFlight=active.get(k);if(inFlight)return inFlight;
 if(!navigator.locks?.request)return Promise.reject(new Error('Safe movement review requires browser locking. Keep the original request.'));
 const offered=structuredClone(choice);
 const work=Promise.resolve(navigator.locks.request(k,{mode:'exclusive'},async()=>{
  guard();
  const history=await psionicRpc('read_movement_aura_review',{p_encounter:e.encounterId,p_event:e.id},true);guard();
  if(history!==null){const found=receipt(history,snapshot);try{localStorage.removeItem(k);}catch{/* Server history wins on retry. */}return found;}
  const stored=localStorage.getItem(k);let request:SavedReview;
  if(stored!==null){
   try{request=JSON.parse(stored);}catch{throw invalid();}
   if(!request||request.version!==1||request.userId!==user||request.eventId!==e.id||request.encounterId!==e.encounterId||request.turnId!==e.turnId
    ||!uuid(request.requestId)||!decisions(request.decisions,snapshot.plan.candidates)||!note(request.note))throw invalid();
  }else{
   if(!decisions(offered,snapshot.plan.candidates)||!note(ruling))throw invalid();
   request={version:1,userId:user,eventId:e.id,encounterId:e.encounterId,turnId:e.turnId,requestId:crypto.randomUUID(),decisions:offered,note:ruling};
   localStorage.setItem(k,JSON.stringify(request));
  }
  guard();const result=await psionicRpc('finish_movement_aura_review',{p_encounter:e.encounterId,p_event:e.id,p_request:request.requestId,p_decisions:request.decisions,p_note:request.note},true);guard();
  const confirmed=receipt(result,snapshot,request);try{localStorage.removeItem(k);}catch{/* Exact replay remains safe. */}return confirmed;
 }));
 active.set(k,work);void work.finally(()=>{if(active.get(k)===work)active.delete(k);}).catch(()=>{});return work;
}
