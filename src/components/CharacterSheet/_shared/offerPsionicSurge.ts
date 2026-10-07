import type {Character} from '../../../types';
import {psionicSurge} from '../../../rules/psionicSurge';
import type {useModal} from '../../shared/Modal';
import {logAction} from '../../shared/ActionLog';

/** v2.765 — shared post-roll decision. Hit Point Dice are spent immediately;
 * cancelling a later target/save decision cannot refund this separate cost. */
export async function offerPsionicSurge(options:{
 roll:number; sides:number; feature:string; campaignId?:string|null;
 current:()=>Character; active:()=>boolean;
 eligible:(character:Character)=>boolean;
 update:(patch:Partial<Character>)=>void;
 confirm:ReturnType<typeof useModal>['confirm'];
 warn:(message:string)=>void;
}) {
 const {roll,sides,feature,current,active}=options;
 const id=current().id;
 if(!psionicSurge(current(),[roll]))return {roll,usedSurge:false};
 const use=await options.confirm({title:'Psionic Surge',
  message:`${feature}: rolled ${roll} on 1d${sides}. Spend 1 Hit Point Die to treat this roll as 4? This does not heal you. The Hit Point Die is spent even if you cancel later or the outcome does not change; the Psionic Energy Die still follows the feature's normal cost.`,
  confirmLabel:'Spend 1 Hit Point Die',cancelLabel:`Keep roll of ${roll}`});
 if(!active()||current().id!==id)return null;
 if(!use)return {roll,usedSurge:false};
 const character=current(),surge=psionicSurge(character,[roll]);
 if(!surge||!options.eligible(character)) {options.warn('Resources changed. Psionic Surge was not applied.');return null;}
 options.update({hit_dice_spent:surge.hit_dice_spent});
 await logAction({campaignId:options.campaignId??null,characterId:character.id,characterName:character.name,
  actionType:'roll',actionName:'Psionic Surge',total:surge.rolls[0],individualResults:[roll],
  notes:`${feature}: ${roll} treated as ${surge.rolls[0]}; spent 1 Hit Point Die. No healing or Energy Die expenditure.`});
 return active()&&current().id===id?{roll:surge.rolls[0],usedSurge:true}:null;
}
