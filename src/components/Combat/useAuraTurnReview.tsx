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
 const pending=useRef<((inputs:ReviewedAuraInputs|null)=>void)|null>(null);
 const current=useRef({scope}),mounted=useRef(false);
 if(current.current.scope!==scope)current.current={scope};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.(null);pending.current=null;};},[]);
 useEffect(()=>{pending.current?.(null);pending.current=null;setContext(null);},[scope]);
 function settle(inputs:ReviewedAuraInputs|null){const callback=pending.current;pending.current=null;setContext(null);callback?.(inputs);}
 const resolve:AuraTurnResolver=async(input,owner)=>{
  const started=current.current;
  const guard=()=>{owner.guard();if(!mounted.current||current.current!==started)throw new Error('The combat view changed. Resume aura review from its original encounter.');};
  guard();
  await processInteractiveAuraResolution(owner.userId,{encounterId:input.encounterId,turnId:owner.turnId,originId:input.aura.originParticipantId,targetId:input.targetParticipantId,auraKey:input.aura.spec.key},input.trigger,
   snapshot=>{guard();return new Promise(resolveInputs=>{pending.current?.(null);pending.current=resolveInputs;setContext(snapshot);});},
   request=>{guard();return reviewAuraResolution(modal,request);},guard);
  return true;
 };
 return {resolve,dialog:context?<AuraInputReview context={context} onResolve={settle}/>:null};
}
