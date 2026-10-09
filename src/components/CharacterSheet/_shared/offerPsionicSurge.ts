import {characterHitDice} from '../../../lib/characterHitDice';
import type {HitDie} from '../../../rules/hitDice';
import type {Character} from '../../../types';
import type {PsionicEnhancementPersistence,EnkindledReceipt,SurgeReceipt} from '../../../lib/api/psionicTurns';
import {psionicSurge} from '../../../rules/psionicSurge';
import type {useModal} from '../../shared/Modal';
import {confirmPsionicPayment} from './confirmPsionicPayment';
/** v2.782 — charge and recovery history share one server transaction. */
export async function offerPsionicSurge(options:{
 propelId?:string;activationId?:string;effectRollId?:string;roll:number;rolls?:readonly number[];sides:number;feature:string;campaignId?:string|null;recoveryNote?:string;
 current:()=>Character;active:()=>boolean;eligible:(character:Character)=>boolean;
 persistence?:PsionicEnhancementPersistence;accept:(receipt:EnkindledReceipt|SurgeReceipt)=>void;
 confirm:ReturnType<typeof useModal>['confirm'];warn:(message:string)=>void;
}){
 const {roll,sides,feature,current,active}=options,id=current().id,rolls=options.rolls??[roll];
 const unchanged={roll,rolls:[...rolls],usedSurge:false,unconfirmed:false};
 if(!psionicSurge(current(),rolls))return unchanged;
 if(!options.persistence){options.warn('Saved Psion payments are unavailable on this sheet. Surge was not spent.');return unchanged;}
 const state=characterHitDice(current());
 if(state.status!=='ready'){options.warn('Review your spent Hit Dice in Rest before using Psionic Surge.');return unchanged;}
 const pools=state.pools.filter(pool=>pool.available>0);
 const message=`${feature}: rolled ${rolls.join(', ')} on ${rolls.length}d${sides}. Spend one Hit Point Die to treat every roll below 4 as 4. This does not heal you or spend another Energy Die. The Hit Die stays spent even if a later outcome does not change; the Energy Die follows the feature’s normal cost.`;
 let hitDie:HitDie|null=null;
 if(pools.length===1){
  const use=await options.confirm({title:'Psionic Surge',message,confirmLabel:'Spend 1 Hit Point Die',cancelLabel:rolls.length===1?`Keep roll of ${roll}`:'Keep these rolls'});
  if(use)hitDie=pools[0].die;
 }else if(pools.length>1){
  if(!options.persistence.chooseHitDie){options.warn('Open the character sheet to choose which Hit Die to spend.');return unchanged;}
  hitDie=await options.persistence.chooseHitDie(current(),message);
 }
 if(!active()||current().id!==id)return null;
 if(hitDie===null)return unchanged;
 const latest=characterHitDice(current());
 if(!psionicSurge(current(),rolls)||!options.eligible(current())||latest.status!=='ready'||!latest.pools.some(pool=>pool.die===hitDie&&pool.available>0)){options.warn('Resources changed. Psionic Surge was not applied.');return null;}
 const request={...(options.propelId?{propelId:options.propelId}:{}),...(options.effectRollId?{effectRollId:options.effectRollId}:{}),...(options.activationId?{activationId:options.activationId}:{}),hitDie,requestId:crypto.randomUUID(),rolls:[...rolls],sourceFeature:feature,recoveryNote:options.recoveryNote};
 const paid=await confirmPsionicPayment(()=>options.persistence!.surge(request),{...options,active:()=>active()&&current().id===id});
 if(paid.status==='unknown')return {...unchanged,unconfirmed:true};
 if(paid.status==='rejected')return unchanged;
 if(active()&&current().id===id)options.accept(paid.receipt);
 // Keep a paid result even if its sheet closes while the response is in flight.
 return {roll:paid.receipt.rolls[0],rolls:paid.receipt.rolls,usedSurge:true,unconfirmed:false};
}
