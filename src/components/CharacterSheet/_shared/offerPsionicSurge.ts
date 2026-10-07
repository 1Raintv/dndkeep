import type {Character} from '../../../types';
import {psionicSurge} from '../../../rules/psionicSurge';
import type {useModal} from '../../shared/Modal';
import {logAction} from '../../shared/ActionLog';

/** v2.765 — shared post-roll decision. Hit Point Dice are spent immediately;
 * cancelling a later target/save decision cannot refund this separate cost. */
export async function offerPsionicSurge(options:{
 roll:number; rolls?:readonly number[]; sides:number; feature:string; campaignId?:string|null;
 current:()=>Character; active:()=>boolean;
 eligible:(character:Character)=>boolean;
 update:(patch:Partial<Character>)=>void;
 confirm:ReturnType<typeof useModal>['confirm'];
 warn:(message:string)=>void;
}) {
 const {roll,sides,feature,current,active}=options;
 const id=current().id;
 const rolls=options.rolls??[roll];
 const unchanged={roll,rolls:[...rolls],usedSurge:false};
 if(!psionicSurge(current(),rolls))return unchanged;
 const use=await options.confirm({title:'Psionic Surge',
  message:`${feature}: rolled ${rolls.join(', ')} on ${rolls.length}d${sides}. Spend 1 Hit Point Die to ${rolls.length===1?'treat this roll as 4':'treat every roll below 4 as 4'}? This does not heal you. The Hit Point Die is spent even if you cancel later or the outcome does not change; the Psionic Energy Die still follows the feature's normal cost.`,
  confirmLabel:'Spend 1 Hit Point Die',cancelLabel:rolls.length===1?`Keep roll of ${roll}`:'Keep these rolls'});
 if(!active()||current().id!==id)return null;
 if(!use)return unchanged;
 const character=current(),surge=psionicSurge(character,rolls);
 if(!surge||!options.eligible(character)) {options.warn('Resources changed. Psionic Surge was not applied.');return null;}
 options.update({hit_dice_spent:surge.hit_dice_spent});
 await logAction({campaignId:options.campaignId??null,characterId:character.id,characterName:character.name,
  actionType:'roll',actionName:'Psionic Surge',total:surge.total,individualResults:[...rolls],
  notes:`${feature}: ${rolls.join(", ")} treated as ${surge.rolls.join(", ")}; spent 1 Hit Point Die. No healing or Energy Die expenditure.`});
 return active()&&current().id===id?{roll:surge.rolls[0],rolls:surge.rolls,usedSurge:true}:null;
}
