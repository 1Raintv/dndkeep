import {settleSavedPsionicPayment} from '../settleSavedPsionicPayment';
import {hasSavedPsionicPayment,type PendingPsionicPayment} from '../psionicPaymentRecovery';
import {useEffect,useMemo,useRef} from 'react';
import {spendRestHitDice,type HitDiceHealingReceipt,completePsionicRest,type PsionicRestReceipt,settlePsionicEnergy,type EnergyReceipt,getEnkindledTurn,spendEnkindledLifeForce,spendPsionicSurge,PsionicRequestError,type PsionicEnhancementPersistence} from '../api/psionicTurns';
interface SaveQueue {flush:()=>Promise<void>;getSnapshot:()=>{pending:boolean;error:string|null}}
type Receipt=HitDiceHealingReceipt|PsionicRestReceipt|{hitDiceSpent:number;hitDiceRevision:number}|EnergyReceipt;
/** v2.782 — settle queued edits before the server charges dice; acknowledge its
 * snapshot locally rather than writing the same absolute resource value again. */
export function usePsionicEnhancements(characterId:string,queue:SaveQueue,accept:(receipt:Receipt)=>void,frozen=false):PsionicEnhancementPersistence{
 const live=useRef({characterId,accept,frozen});live.current={characterId,accept,frozen};
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 return useMemo(()=>{
  async function pay<T extends Receipt>(payment:PendingPsionicPayment,request:()=>Promise<T>):Promise<T>{
   const previouslyUnconfirmed=hasSavedPsionicPayment(characterId,payment.request.requestId);
   const blocked=(message:string)=>new PsionicRequestError(message,!previouslyUnconfirmed);
   if(!mounted.current||live.current.characterId!==characterId||live.current.frozen)throw blocked('This sheet is not available for resource changes.');
   if(queue.getSnapshot().error)throw blocked('Retry your failed character save before spending character resources.');
   try{await queue.flush();}catch{throw blocked('Your character changes could not be saved. No new dice-cost confirmation was sent.');}
   const snapshot=queue.getSnapshot();
   if(snapshot.pending||snapshot.error)throw blocked('Save your pending character changes before spending character resources.');
   if(!mounted.current||live.current.characterId!==characterId||live.current.frozen)throw blocked('The character sheet changed before confirming the dice cost.');
   const receipt=await settleSavedPsionicPayment(characterId,payment,request);
   if(mounted.current&&live.current.characterId===characterId)live.current.accept(receipt);
   return receipt;
  }
  return {heal:request=>pay({kind:'healing',request},()=>spendRestHitDice(characterId,request)),rest:request=>pay({kind:'rest',request},()=>completePsionicRest(characterId,request)),energy:request=>pay({kind:'energy',request},()=>settlePsionicEnergy(characterId,request)),getTurn:()=>getEnkindledTurn(characterId),spend:request=>pay({kind:'enkindled',request},()=>spendEnkindledLifeForce(characterId,request)),surge:request=>pay({kind:'surge',request},()=>spendPsionicSurge(characterId,request))};
 },[characterId,queue]);
}
