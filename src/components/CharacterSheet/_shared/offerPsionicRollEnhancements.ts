import {enkindledCapacity,spendEnkindled} from '../../../rules/enkindledLifeForce';
import {rollDie} from '../../../rules/dice';
import {offerPsionicSurge} from './offerPsionicSurge';
import {confirmPsionicPayment} from './confirmPsionicPayment';
import type {useModal} from '../../shared/Modal';
type Options=Parameters<typeof offerPsionicSurge>[0]&{prompt:ReturnType<typeof useModal>['prompt'];skipEnkindled?:boolean;skipSurge?:boolean};
/** v2.782 — the server owns Enkindled's turn claim, cost and recovery record. */
export async function offerPsionicRollEnhancements(options:Options){
 // v2.828: a base payment can finish after navigation. Do not capture the
 // next character as the owner of enhancements to the previous paid roll.
 if(!options.active())return null;
 const id=options.current().id,base=[...(options.rolls??[options.roll])];let extra:number[]=[];
 const unchanged={roll:base.reduce((a,b)=>a+b,0),rolls:base,originalRolls:base,enkindledRolls:extra,usedSurge:false,unconfirmed:false};
 const maximum=options.skipEnkindled?0:enkindledCapacity(options.current());
 if(maximum&&options.persistence){
  let state;
  try{state=await options.persistence.getTurn();}catch{options.warn('Could not check Enkindled’s saved turn use. No extra dice were spent.');}
  if(!options.active()||options.current().id!==id)return null;
  if(state?.used)options.warn(`Enkindled already used this turn: extra rolls ${state.used.extraRolls.join(', ')}. Advance the tabletop or combat turn before using it again.`);
  if(state&&!state.used){
   const answer=await options.prompt({title:'Enkindled Life Force',message:`${options.feature}: rolled ${base.join(', ')}. Once per turn, spend 1–${maximum} Hit Point Dice to roll that many extra d${options.sides} Energy Dice. Extra Energy Dice are not spent and no HP is healed. This use is shared across tabs and survives reloads. Enter 0 to keep this roll.`,defaultValue:'0',confirmLabel:'Continue',cancelLabel:'No extra dice'});
   if(!options.active()||options.current().id!==id)return null;
   const count=answer===null?0:Number(answer);
   if(count!==0){
    if(!spendEnkindled(options.current(),count)||!options.eligible(options.current()))options.warn('Resources or eligibility changed. Enkindled Life Force was not applied.');
    else{
     const request={...(options.effectRollId?{effectRollId:options.effectRollId}:{}),...(options.activationId?{activationId:options.activationId}:{}),requestId:crypto.randomUUID(),turn:state.turn,count,baseRolls:base,extraRolls:Array.from({length:count},()=>rollDie(options.sides)),sourceFeature:options.feature,recoveryNote:options.recoveryNote};
     const paid=await confirmPsionicPayment(()=>options.persistence!.spend(request),{...options,active:()=>options.active()&&options.current().id===id});
     if(paid.status==='unknown')return {...unchanged,unconfirmed:true};
     if(paid.status==='paid'){extra=paid.receipt.extraRolls;if(options.active()&&options.current().id===id)options.accept(paid.receipt);}
    }
   }
  }
 }else if(maximum)options.warn('Saved Psion payments are unavailable on this sheet. Enkindled was not spent.');
 const originals=[...base,...extra];
 // A closed sheet still returns its saved extra rolls for manual recovery.
 const surge=!options.skipSurge&&options.active()&&options.current().id===id?await offerPsionicSurge({...options,roll:originals[0],rolls:originals}):null;
 if(!surge&&!extra.length)return null;
 const rolls=surge?.rolls??originals;
 return {roll:rolls.reduce((sum,n)=>sum+n,0),rolls,originalRolls:originals,enkindledRolls:extra,usedSurge:surge?.usedSurge??false,unconfirmed:surge?.unconfirmed??false};
}
