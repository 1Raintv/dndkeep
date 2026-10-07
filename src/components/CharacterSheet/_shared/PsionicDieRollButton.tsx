import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {psionicPoolRemaining,psionicDieSides} from '../../../rules/psionicRestoration';
import {rollDie} from '../../../rules/dice';
import {findDiscipline,hasDiscipline} from '../../../data/psionDisciplines';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {logAction} from '../../shared/ActionLog';
/** v2.780 — manual Energy Die rolls share the same enhancements as automated
 * powers; the result is logged even if the originating sheet closes. */
export default function PsionicDieRollButton({character,onUpdate,feature,label,onRolled}:{character:Character;onUpdate:(patch:Partial<Character>)=>void;feature:string;label:string;onRolled:(total:number,sides:number)=>void}){
 const latest=useOptimisticCharacterRef(character);const update=useRef(onUpdate);update.current=onUpdate;
 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const eligible=(c:Character)=>{
  if(c.class_name!=='Psion')return false;
  const discipline=findDiscipline(feature),chosen=c.class_resources?.['psion-disciplines'];
  return !discipline||(Array.isArray(chosen)&&hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline));
 };
 function patch(change:Partial<Character>){latest.current={...latest.current,...change};update.current(change);}
 async function run(){
  const c=latest.current,pool=psionicPoolRemaining(c.level,c.class_resources?.['psionic-energy-dice']);
  if(busy.current||!eligible(c)||!pool)return;busy.current=true;setPending(true);
  try{
   const sides=psionicDieSides(c.level),original=rollDie(sides);
   patch({class_resources:{...c.class_resources,'psionic-energy-dice':pool-1}});
   const enhanced=await offerPsionicRollEnhancements({roll:original,sides,feature,campaignId:c.campaign_id,current:()=>latest.current,active:()=>mounted.current,eligible,update:patch,prompt:modal.prompt,confirm:modal.confirm,warn:message=>showToast(message,'warn')});
   const total=enhanced?.roll??original,originals=enhanced?.originalRolls??[original];
   if(mounted.current&&latest.current.id===c.id){onRolled(total,sides);showToast(`${feature}: ${total}. Apply the feature at the table.`,'success');}
   const notes=`Manual feature roll; apply its effect at the table.${enhanced?.enkindledRolls.length?` Enkindled: ${enhanced.enkindledRolls.length} Hit Point Dice spent; extra Energy Dice not expended.`:''}${enhanced?.usedSurge?' Surge: low rolls treated as 4; 1 Hit Point Die spent.':''} Rolled ${originals.join(', ')}; total ${total} · ${pool-1} dice remaining`;
   const warn=()=>showToast(`${feature}: rolled ${total}, but history could not be saved. Keep this paid result.`,'warn');
   void logAction({campaignId:c.campaign_id??null,characterId:c.id,characterName:c.name,actionType:'roll',actionName:feature==='Psionic Energy Dice'?`Spent Psionic Energy Die (1d${sides})`:feature,diceExpression:`${originals.length}d${sides}`,individualResults:originals,total,notes}).then(result=>{if(result?.error)warn();}).catch(warn);
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 const pool=psionicPoolRemaining(character.level,character.class_resources?.['psionic-energy-dice']);
 return <button className="btn-ghost" style={{fontSize:11,minHeight:36,color:'#c4b5fd'}} disabled={pending||!eligible(character)||!pool} onClick={()=>void run()}>{pending?'Rolling…':label}</button>;
}
