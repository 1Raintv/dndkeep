import type {Character} from '../../../types';
import type {PsionicEnhancementPersistence,EnkindledReceipt,SurgeReceipt} from '../../../lib/api/psionicTurns';
import {psionicSurge} from '../../../rules/psionicSurge';
import type {useModal} from '../../shared/Modal';
import {confirmPsionicPayment} from './confirmPsionicPayment';
/** v2.782 — charge and recovery history share one server transaction. */
export async function offerPsionicSurge(options:{
 roll:number;rolls?:readonly number[];sides:number;feature:string;campaignId?:string|null;recoveryNote?:string;
 current:()=>Character;active:()=>boolean;eligible:(character:Character)=>boolean;
 persistence?:PsionicEnhancementPersistence;accept:(receipt:EnkindledReceipt|SurgeReceipt)=>void;
 confirm:ReturnType<typeof useModal>['confirm'];warn:(message:string)=>void;
}){
 const {roll,sides,feature,current,active}=options,id=current().id,rolls=options.rolls??[roll];
 const unchanged={roll,rolls:[...rolls],usedSurge:false,unconfirmed:false};
 if(!psionicSurge(current(),rolls))return unchanged;
 if(!options.persistence){options.warn('Saved Psion payments are unavailable on this sheet. Surge was not spent.');return unchanged;}
 const use=await options.confirm({title:'Psionic Surge',message:`${feature}: rolled ${rolls.join(', ')} on ${rolls.length}d${sides}. Spend 1 Hit Point Die to ${rolls.length===1?'treat this roll as 4':'treat every roll below 4 as 4'}? This does not heal you. The cost remains even if a later outcome does not change; the Energy Die follows the feature’s normal cost.`,confirmLabel:'Spend 1 Hit Point Die',cancelLabel:rolls.length===1?`Keep roll of ${roll}`:'Keep these rolls'});
 if(!active()||current().id!==id)return null;
 if(!use)return unchanged;
 if(!psionicSurge(current(),rolls)||!options.eligible(current())){options.warn('Resources changed. Psionic Surge was not applied.');return null;}
 const request={requestId:crypto.randomUUID(),rolls:[...rolls],sourceFeature:feature,recoveryNote:options.recoveryNote};
 const paid=await confirmPsionicPayment(()=>options.persistence!.surge(request),{...options,active:()=>active()&&current().id===id});
 if(paid.status==='unknown')return {...unchanged,unconfirmed:true};
 if(paid.status==='rejected')return unchanged;
 if(active()&&current().id===id)options.accept(paid.receipt);
 // Keep a paid result even if its sheet closes while the response is in flight.
 return {roll:paid.receipt.rolls[0],rolls:paid.receipt.rolls,usedSurge:true,unconfirmed:false};
}
