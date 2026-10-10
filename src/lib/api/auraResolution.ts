import {prepareAuraProposal,type ReviewedAuraInputs} from '../../rules/prepareAuraProposal';
import {verifyAuraResolutionReceipt,type AuraResolutionReceipt} from '../auraResolutionReceipt';
import {psionicRpc} from './psionicTurns';
export interface AuraIdentity {encounterId:string;turnId:string;originId:string;targetId:string;auraKey:string}
export type AuraTrigger='creature_entered'|'emanation_entered'|'turn_end';
export interface SavedAuraRequest {version:1;phase:'review'|'ready';userId:string;requestId:string;identity:AuraIdentity;expected:Record<string,unknown>;proposal:Record<string,unknown>}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validIdentity=(i:AuraIdentity)=>!!i&&[i.encounterId,i.turnId,i.originId,i.targetId].every(uuid)&&typeof i.auraKey==='string'&&!!i.auraKey;
const same=(a:AuraIdentity,b:AuraIdentity)=>a.encounterId===b.encounterId&&a.turnId===b.turnId&&a.originId===b.originId&&a.targetId===b.targetId&&a.auraKey===b.auraKey;
const key=(user:string,i:AuraIdentity)=>`dndkeep:aura-resolution:${JSON.stringify([user,i.encounterId,i.turnId,i.originId,i.targetId,i.auraKey])}`;
const invalid=()=>new Error('Saved aura preparation is incomplete or unverified. Keep it for review; do not roll again.');
function matchesSnapshot(c:unknown,i:AuraIdentity):c is Record<string,unknown>{
 return object(c)&&c.encounterId===i.encounterId&&c.turnId===i.turnId&&object(c.origin)&&object(c.origin.participant)&&c.origin.participant.id===i.originId
  &&object(c.target)&&object(c.target.participant)&&c.target.participant.id===i.targetId&&object(c.aura)&&object(c.aura.aura)&&c.aura.aura.key===i.auraKey;
}
export function savedAuraResolution(user:string,i:AuraIdentity):SavedAuraRequest|null {
 if(!uuid(user)||!validIdentity(i))throw invalid();
 const raw=localStorage.getItem(key(user,i));if(raw===null)return null;
 let r:unknown;try{r=JSON.parse(raw);}catch{throw invalid();}
 if(!object(r)||r.version!==1||!['review','ready'].includes(String(r.phase))||r.userId!==user||!uuid(r.requestId)||!object(r.identity)
  ||!same(r.identity as unknown as AuraIdentity,i)||!matchesSnapshot(r.expected,i)||!object(r.proposal))throw invalid();
 return r as unknown as SavedAuraRequest;
}
function forget(user:string,i:AuraIdentity){try{localStorage.removeItem(key(user,i));}catch{/* Confirmed server history remains authoritative. */}}
const active=new Map<string,Promise<AuraResolutionReceipt>>();
/** v2.869: hold a same-origin browser lock across preparation and commit.
 * Persist an interruption marker BEFORE invoking the synchronous dice callback.
 * Trigger is deliberately not part of the once-per-turn recovery identity.
 * Scope checks concern the current user/view, not whether an old turn ended.
 * Callers refresh live state; historical result pools must never patch stores. */
export function processSavedAuraResolution(user:string,input:AuraIdentity,trigger:AuraTrigger,
 prepare:(context:Record<string,unknown>,requestId:string)=>Record<string,unknown>,assertCurrentScope:()=>void,
 review?:(request:SavedAuraRequest)=>Promise<{useResistance:boolean}|null>):Promise<AuraResolutionReceipt>{
 assertCurrentScope();
 if(!uuid(user)||!validIdentity(input)||!['creature_entered','emanation_entered','turn_end'].includes(trigger))return Promise.reject(invalid());
 const i=structuredClone(input),k=key(user,i),pending=active.get(k);if(pending)return pending;
 if(!navigator.locks?.request)return Promise.reject(new Error('Safe aura recovery requires browser locking. Keep the saved request and use a supported browser.'));
 const work=Promise.resolve(navigator.locks.request(k,{mode:'exclusive'},async()=>{
  assertCurrentScope();
  const args={p_encounter:i.encounterId,p_turn:i.turnId,p_origin:i.originId,p_target:i.targetId,p_aura:i.auraKey};
  async function readReceipt():Promise<AuraResolutionReceipt|null>{
   const value=await psionicRpc('read_aura_resolution',args,true);assertCurrentScope();
   if(value===null)return null;
   if(!object(value)||!uuid(value.requestId)||!object(value.request)||!matchesSnapshot(value.request.expected,i))throw invalid();
   return verifyAuraResolutionReceipt(value.request.expected,value.request.proposal,value.requestId,value.result);
  }
  const prior=await readReceipt();if(prior){forget(user,i);return prior;}
  let request=savedAuraResolution(user,i);
  if(!request){
   const context=await psionicRpc('get_aura_resolution_context',{...args,p_trigger:trigger},true);assertCurrentScope();
   if(!matchesSnapshot(context,i)||context.trigger!==trigger)throw invalid();
   const requestId=crypto.randomUUID();
   localStorage.setItem(k,JSON.stringify({version:1,phase:'preparing',userId:user,requestId,identity:i,expected:context}));
   const proposal=prepare(structuredClone(context),requestId);assertCurrentScope();
   if(!object(proposal)||'then' in proposal)throw invalid();
   // JSON round-trip fixes the exact wire representation before any RPC.
   const serialized=JSON.stringify({version:1,phase:review?'review':'ready',userId:user,requestId,identity:i,expected:context,proposal});
   localStorage.setItem(k,serialized);request=savedAuraResolution(user,i);if(!request)throw invalid();
  }
  if(request.phase==='review'){
   // Persist the dice before opening a decision UI. Cancel/reload may reopen
   // that decision, but a submitted ('ready') request is never edited again.
   if(!review)throw new Error('This saved aura requires review before it can be applied.');
   const choice=await review(structuredClone(request));assertCurrentScope();
   if(choice===null)throw new Error('Aura decision postponed. The original rolls are saved for review.');
   if(!object(choice)||Object.keys(choice).length!==1||typeof choice.useResistance!=='boolean')throw invalid();
   const reviewed={...request,phase:'ready',proposal:{...request.proposal,useResistance:choice.useResistance}};
   localStorage.setItem(k,JSON.stringify(reviewed));request=savedAuraResolution(user,i);if(!request)throw invalid();
  }
  assertCurrentScope();
  let result:unknown;
  try{
   result=await psionicRpc('commit_aura_resolution',{p_encounter:i.encounterId,p_request:request.requestId,p_expected:request.expected,p_proposal:request.proposal},true);
  }catch(error){
   assertCurrentScope();
   // Another device may have won, or the response may have been lost. Only
   // an independently verified receipt permits discarding the original dice.
   const recovered=await readReceipt();if(recovered){forget(user,i);return recovered;}throw error;
  }
  assertCurrentScope();
  const receipt=verifyAuraResolutionReceipt(request.expected,request.proposal,request.requestId,result);
  forget(user,i);return receipt;
 }));
 active.set(k,work);void work.finally(()=>{if(active.get(k)===work)active.delete(k);}).catch(()=>{});return work;
}

/** v2.869: real dice preparation for the reviewed UI path. Inputs are captured
 * before any await; retries use the saved proposal, never these new arguments.
 * The generic recovery API remains available for deterministic regression tests. */
export function processReviewedAuraResolution(user:string,identity:AuraIdentity,trigger:AuraTrigger,inputs:ReviewedAuraInputs,
 assertCurrentScope:()=>void,review:(request:SavedAuraRequest)=>Promise<{useResistance:boolean}|null>){
 if(typeof review!=='function')return Promise.reject(new Error('Aura rolls require a review step before applying.'));
 const reviewed=structuredClone(inputs);
 return processSavedAuraResolution(user,identity,trigger,(context,requestId)=>prepareAuraProposal(context,requestId,reviewed,crypto.randomUUID()),assertCurrentScope,review);
}
