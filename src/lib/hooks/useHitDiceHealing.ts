import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../types';
import type {DiceRollEvent} from '../../context/DiceRollContext';
import {rollDie} from '../../rules/dice';
import {spendHitDice,type HitDie} from '../../rules/hitDice';
import {characterHitDice} from '../characterHitDice';
import {computeStats} from '../gameUtils';
import {createHitDiceHealingRequest,type HitDiceHealingRequest} from '../hitDiceHealingRequest';
import type {PsionicEnhancementPersistence} from '../api/psionicTurns';
import {pendingPsionicPayments,forgetPsionicPayment,PSIONIC_PAYMENT_CHANGED} from '../psionicPaymentRecovery';
interface Queue {flush:()=>Promise<void>;getSnapshot:()=>{pending:boolean;error:string|null};getAcknowledged:()=>Partial<Character>|null}
interface Options {characterRef:{current:Character};queue:Queue;persistence:PsionicEnhancementPersistence;acceptSaved:(saved:Partial<Character>)=>void;animate:(event:DiceRollEvent)=>void;onGained:(hp:number)=>void;disabled:boolean}
const read=(id:string)=>pendingPsionicPayments(id,true).filter(payment=>payment.kind==='healing');
/** v2.798 — one captured roll, one durable payment, no optimistic HP patch.
 * A navigation or lost response cannot cause a reroll or a second history write. */
export function useHitDiceHealing(options:Options){
 const id=options.characterRef.current.id,live=useRef(options);live.current=options;
 const mounted=useRef(true),active=useRef<{id:string;token:symbol}|null>(null);
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(()=>read(id)),[message,setMessage]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const update=()=>setPending(read(id));update();setBusy(false);setMessage('');window.addEventListener('storage',update);window.addEventListener(PSIONIC_PAYMENT_CHANGED,update);return()=>{window.removeEventListener('storage',update);window.removeEventListener(PSIONIC_PAYMENT_CHANGED,update);};},[id]);
 const isBlocked=()=>active.current?.id===live.current.characterRef.current.id||read(live.current.characterRef.current.id).length>0;
 async function perform(makeRequest:()=>HitDiceHealingRequest,recovering=false){
  if(active.current?.id===id||live.current.disabled||live.current.characterRef.current.id!==id||(!recovering&&read(id).length))return;
  const token=Symbol();active.current={id,token};setBusy(true);setMessage('');
  const current=()=>mounted.current&&live.current.characterRef.current.id===id;
  try{
   if(options.queue.getSnapshot().error)throw new Error('Retry your failed character save before healing.');
   await options.queue.flush();
   const state=options.queue.getSnapshot();if(state.pending||state.error)throw new Error('Save pending character changes before healing.');
   if(!current()||live.current.disabled)return;
   const saved=options.queue.getAcknowledged();if(saved)live.current.acceptSaved(saved);
   if(!recovering&&read(id).length)throw new Error('Confirm saved healing before rolling again.');
   const request=makeRequest();
   if(!live.current.persistence.heal)throw new Error('Healing recovery is unavailable. Reload the sheet.');
   const receipt=await live.current.persistence.heal(request);
   if(!current())return;
   if(recovering){setMessage(`Saved healing confirmed: ${receipt.gained} HP recovered. Current HP and Hit Dice are refreshed.`);return;}
   live.current.onGained(receipt.gained);
   const bonus=request.constitutionModifier*request.rolls.length;
   live.current.animate({result:request.rolls.reduce((sum,n)=>sum+n,0),dieType:request.hitDie,
    allDice:request.rolls.map(value=>({die:request.hitDie,value})),flatBonus:bonus,total:receipt.healing,
    expression:`${request.rolls.length}d${request.hitDie}${bonus>=0?'+':''}${bonus}`,label:`Hit Dice — ${request.rolls.length}d${request.hitDie}`});
  }catch(error){if(current())setMessage(error instanceof Error?error.message:'Healing was not confirmed. Confirm the saved request before rolling again.');}
  finally{if(active.current?.token===token)active.current=null;if(current())setBusy(false);}
 }
 return {busy,pending,message,blocked:busy||pending.length>0,isBlocked,
  roll:(count:number,die:HitDie)=>perform(()=>{
   const character=live.current.characterRef.current;
   if(!spendHitDice(characterHitDice(character),die,count)||character.current_hp<1||character.current_hp>=character.max_hp)throw new Error('Review your HP and available Hit Dice before rolling.');
   return createHitDiceHealingRequest(character,die,Array.from({length:count},()=>rollDie(die)),computeStats(character).modifiers.constitution,crypto.randomUUID());
  }),
  recover:(request:HitDiceHealingRequest)=>perform(()=>request,true),
  dismiss:(requestId:string)=>{if(active.current?.id===id)return;forgetPsionicPayment(id,requestId);setMessage('Recovery notice dismissed. No HP or dice were changed.');},
 };
}
