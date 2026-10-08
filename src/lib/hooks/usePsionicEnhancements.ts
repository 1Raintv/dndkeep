import {getPsionicEffectRollRecords,finalizePsionicEffectRoll,applyBiofeedbackEffect,type BiofeedbackEffectReceipt} from '../api/psionicEffectRolls';
import {getSharpenedRollRecords,finalizeSharpenedRoll} from '../api/sharpenedRolls';
import {beginPsionicDiscipline,finishPsionicDiscipline,getPsionicDisciplineTurn,type DisciplineReceipt} from '../api/psionicDisciplines';
import {settleSavedPsionicPayment} from '../settleSavedPsionicPayment';
import {hasSavedPsionicPayment,type PendingPsionicPayment} from '../psionicPaymentRecovery';
import {useEffect,useMemo,useRef} from 'react';
import {spendRestHitDice,type HitDiceHealingReceipt,completePsionicRest,type PsionicRestReceipt,settlePsionicEnergy,type EnergyReceipt,getEnkindledTurn,spendEnkindledLifeForce,spendPsionicSurge,PsionicRequestError,type PsionicEnhancementPersistence} from '../api/psionicTurns';
interface SaveQueue {flush:()=>Promise<void>;getSnapshot:()=>{pending:boolean;error:string|null}}
type Receipt=BiofeedbackEffectReceipt|DisciplineReceipt|HitDiceHealingReceipt|PsionicRestReceipt|{hitDiceSpent:number;hitDiceRevision:number}|EnergyReceipt;
/** v2.782 — settle queued edits before the server charges dice; acknowledge its
 * snapshot locally rather than writing the same absolute resource value again. */
export function usePsionicEnhancements(characterId:string,queue:SaveQueue,accept:(receipt:Receipt)=>void,frozen=false):PsionicEnhancementPersistence{
 const live=useRef({characterId,accept,frozen});live.current={characterId,accept,frozen};
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 return useMemo(()=>{
  async function pay<T extends Receipt,P extends PendingPsionicPayment>(input:P,send:(request:P['request'])=>Promise<T>):Promise<T>{
   // Freeze before queue.flush: editing a caller-owned object during that wait
   // cannot change the saved roll or the eventual RPC payload.
   const payment=structuredClone(input);
   const previouslyUnconfirmed=hasSavedPsionicPayment(characterId,payment.request.requestId);
   const blocked=(message:string)=>new PsionicRequestError(message,!previouslyUnconfirmed);
   if(!mounted.current||live.current.characterId!==characterId||live.current.frozen)throw blocked('This sheet is not available for resource changes.');
   if(queue.getSnapshot().error)throw blocked('Retry your failed character save before spending character resources.');
   try{await queue.flush();}catch{throw blocked('Your character changes could not be saved. No new dice-cost confirmation was sent.');}
   const snapshot=queue.getSnapshot();
   if(snapshot.pending||snapshot.error)throw blocked('Save your pending character changes before spending character resources.');
   if(!mounted.current||live.current.characterId!==characterId||live.current.frozen)throw blocked('The character sheet changed before confirming the dice cost.');
   const receipt=await settleSavedPsionicPayment(characterId,payment,()=>send(payment.request));
   if(mounted.current&&live.current.characterId===characterId)live.current.accept(receipt);
   return receipt;
  }
  return {applyBiofeedback:async activationId=>{
   const active=()=>mounted.current&&live.current.characterId===characterId&&!live.current.frozen;
   if(!active()||queue.getSnapshot().error)throw new PsionicRequestError('Save your character changes before applying Biofeedback.',false);
   await queue.flush();const state=queue.getSnapshot();
   if(!active()||state.pending||state.error)throw new PsionicRequestError('The sheet changed or has unsaved edits. Biofeedback remains recoverable.',false);
   const result=await applyBiofeedbackEffect(characterId,activationId);
   if(active())live.current.accept(result);window.dispatchEvent(new Event('dndkeep:psionic-effect-roll-changed'));return result;
  },getEffectRolls:()=>getPsionicEffectRollRecords(characterId),finalizeEffectRoll:async activationId=>{
   if(!mounted.current||live.current.characterId!==characterId||live.current.frozen)throw new PsionicRequestError('This sheet is not available to confirm rolls.',true);
   const result=await finalizePsionicEffectRoll(characterId,activationId);
   window.dispatchEvent(new Event('dndkeep:psionic-effect-roll-changed'));return result;
  },getSharpenedRolls:()=>getSharpenedRollRecords(characterId),finalizeSharpenedRoll:async activationId=>{
   if(!mounted.current||live.current.characterId!==characterId||live.current.frozen)throw new PsionicRequestError('This sheet is not available to confirm rolls.',true);
   const result=await finalizeSharpenedRoll(characterId,activationId);
   window.dispatchEvent(new Event('dndkeep:sharpened-roll-changed'));return result;
  },getDisciplineTurn:()=>getPsionicDisciplineTurn(characterId),beginDiscipline:request=>pay({kind:'discipline-begin',request},saved=>beginPsionicDiscipline(characterId,saved)),finishDiscipline:request=>pay({kind:'discipline-finish',request},saved=>finishPsionicDiscipline(characterId,saved)),heal:request=>pay({kind:'healing',request},saved=>spendRestHitDice(characterId,saved)),rest:request=>pay({kind:'rest',request},saved=>completePsionicRest(characterId,saved)),energy:request=>pay({kind:'energy',request},saved=>settlePsionicEnergy(characterId,saved)),getTurn:()=>getEnkindledTurn(characterId),spend:request=>pay({kind:'enkindled',request},saved=>spendEnkindledLifeForce(characterId,saved)),surge:request=>pay({kind:'surge',request},saved=>spendPsionicSurge(characterId,saved))};
 },[characterId,queue]);
}
