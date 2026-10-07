import {enkindledCapacity,spendEnkindled} from '../../../rules/enkindledLifeForce';
import {rollDie} from '../../../rules/dice';
import {offerPsionicSurge} from './offerPsionicSurge';
import {logAction} from '../../shared/ActionLog';
import type {useModal} from '../../shared/Modal';
type Options=Parameters<typeof offerPsionicSurge>[0]&{prompt:ReturnType<typeof useModal>['prompt']};
/** v2.780 — choose extra dice first, then offer one Surge for the entire roll.
 * Turn eligibility is explicitly confirmed until shared turn claims are available. */
export async function offerPsionicRollEnhancements(options:Options){
 const id=options.current().id,base=[...(options.rolls??[options.roll])];let extra:number[]=[];
 const maximum=enkindledCapacity(options.current());
 if(maximum){
  const answer=await options.prompt({title:'Enkindled Life Force',message:`${options.feature}: rolled ${base.join(', ')}. Once per turn, spend 1–${maximum} Hit Point Dice to roll that many extra d${options.sides} Energy Dice and add them to this total. Extra Energy Dice are not spent and no HP is healed. Confirm you have not used Enkindled this turn. Enter 0 to keep this roll.`,defaultValue:'0',confirmLabel:'Continue',cancelLabel:'No extra dice'});
  if(!options.active()||options.current().id!==id)return null;
  const count=answer===null?0:Number(answer);
  if(count!==0){
   const patch=spendEnkindled(options.current(),count);
   if(!patch||!options.eligible(options.current()))options.warn('Resources or eligibility changed. Enkindled Life Force was not applied.');
   else{
    options.update(patch);extra=Array.from({length:count},()=>rollDie(options.sides));
    const warn=()=>options.warn(`Enkindled extra rolls ${extra.join(', ')} were paid, but their history could not be saved.`);
    void logAction({campaignId:options.campaignId??null,characterId:id,characterName:options.current().name,actionType:'roll',actionName:'Enkindled Life Force',individualResults:extra,total:extra.reduce((a,b)=>a+b,0),notes:`${options.feature}: spent ${count} Hit Point Dice. Extra Energy Dice not expended; no healing. Once-per-turn use confirmed manually.`}).then(result=>{if(result?.error)warn();}).catch(warn);
   }
  }
 }
 const originals=[...base,...extra];
 const surge=await offerPsionicSurge({...options,roll:originals[0],rolls:originals});
 if(!surge&&!extra.length)return null;
 // Keep already-paid extra dice even if a later Surge decision is dismissed.
 const rolls=surge?.rolls??originals;
 return {roll:rolls.reduce((sum,n)=>sum+n,0),rolls,originalRolls:originals,enkindledRolls:extra,usedSurge:surge?.usedSurge??false};
}
