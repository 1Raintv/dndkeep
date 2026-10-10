import MovementAuraReview from './MovementAuraReview';
import {pendingMovementAuraReviews,finishMovementAuraReview,type MovementAuraReview as MovementReview,type MovementTurnReviewer} from '../../lib/api/movementAuraReviews';
import type {AuraIdentity,AuraTrigger} from '../../lib/api/auraResolution';
import {useEffect,useRef,useState} from 'react';
import {useModal} from '../shared/Modal';
import AuraInputReview from './AuraInputReview';
import {reviewAuraResolution} from './reviewAuraResolution';
import {processInteractiveAuraResolution} from '../../lib/api/auraResolution';
import type {ReviewedAuraInputs} from '../../rules/prepareAuraProposal';
import type {AuraTurnResolver} from '../../lib/auras';
/** v2.869: abandoning the owning view postpones review, never approves it. */
export function useAuraTurnReview(scope:string|undefined){
 const modal=useModal(),[context,setContext]=useState<Record<string,unknown>|null>(null);
 const [movement,setMovement]=useState<{review:MovementReview;user:string;guard:()=>void}|null>(null);
 const movementPending=useRef<((done:boolean)=>void)|null>(null);
 const pending=useRef<((inputs:ReviewedAuraInputs|null)=>void)|null>(null);
 const current=useRef({scope}),mounted=useRef(false);
 if(current.current.scope!==scope)current.current={scope};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.(null);pending.current=null;movementPending.current?.(false);movementPending.current=null;};},[]);
 useEffect(()=>{pending.current?.(null);pending.current=null;setContext(null);movementPending.current?.(false);movementPending.current=null;setMovement(null);},[scope]);
 function settle(inputs:ReviewedAuraInputs|null){const callback=pending.current;pending.current=null;setContext(null);callback?.(inputs);}
 function scopedGuard(owner:()=>void){const started=current.current;return ()=>{owner();if(!mounted.current||current.current!==started)throw new Error('The combat view changed. Resume aura review from its original encounter.');};}
 async function resolveIdentity(user:string,identity:AuraIdentity,trigger:AuraTrigger,guard:()=>void){
  guard();return processInteractiveAuraResolution(user,identity,trigger,
   snapshot=>{guard();return new Promise<ReviewedAuraInputs|null>(resolveInputs=>{pending.current?.(null);pending.current=resolveInputs;setContext(snapshot);});},
   request=>{guard();return reviewAuraResolution(modal,request);},guard);
 }
 const resolve:AuraTurnResolver=async(input,owner)=>{
  await resolveIdentity(owner.userId,{encounterId:input.encounterId,turnId:owner.turnId,originId:input.aura.originParticipantId,targetId:input.targetParticipantId,auraKey:input.aura.spec.key},input.trigger,scopedGuard(owner.guard));return true;
 };
 function settleMovement(done:boolean){const callback=movementPending.current;movementPending.current=null;setMovement(null);callback?.(done);}
 const reviewMovement:MovementTurnReviewer=async(encounter,user,ownerGuard)=>{
  const guard=scopedGuard(ownerGuard);guard();
  for(;;){
   const [review]=await pendingMovementAuraReviews(encounter,1);guard();if(!review)return;
   const done=await new Promise<boolean>(resolveReview=>{movementPending.current?.(false);movementPending.current=resolveReview;setMovement({review,user,guard});});guard();
   if(!done)throw new Error('Movement review postponed. Resolve pending effects before ending the turn.');
  }
 };
 return {resolve,reviewMovement,dialog:<>
 {movement&&<MovementAuraReview key={movement.review.event.id} review={movement.review} onClose={()=>settleMovement(false)}
  onResolve={async candidate=>{const e=movement.review.event;const r=await resolveIdentity(movement.user,{encounterId:e.encounterId,turnId:e.turnId,originId:candidate.originId,targetId:candidate.targetId,auraKey:candidate.auraKey},candidate.trigger,movement.guard);return r.requestId;}}
  onComplete={async(decisions,note)=>{await finishMovementAuraReview(movement.user,movement.review,decisions,note,movement.guard);movement.guard();settleMovement(true);}}/>}
 {context?<AuraInputReview context={context} onResolve={settle}/>:null}
 </>};
}
