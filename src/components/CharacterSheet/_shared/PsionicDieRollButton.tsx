import {prepareDiscipline,beginDiscipline} from './disciplinePayment';
import type {DisciplineId} from '../../../lib/psionicDisciplineRequest';
import {psionProgression} from '../../../rules/psionProgression';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {payPsionicEnergy} from './payPsionicEnergy';
import {acceptPsionicHitDiceReceipt} from '../../../lib/characterRealtime';
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
export default function PsionicDieRollButton({persistence,character,feature,label,onRolled}:{persistence?:PsionicEnhancementPersistence;character:Character;onUpdate:(patch:Partial<Character>)=>void;feature:string;label:string;onRolled:(total:number,sides:number)=>void}){
 const latest=useOptimisticCharacterRef(character);
 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const eligible=(c:Character)=>{
  const progression=psionProgression(c);
  if(!progression)return false;
  const discipline=findDiscipline(feature),chosen=c.class_resources?.['psion-disciplines'];
  return !discipline||(progression.level>=2&&Array.isArray(chosen)&&hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline));
 };
 async function run(){
  const c=latest.current,pool=psionicPoolRemaining(psionProgression(c)?.level??0,c.class_resources?.['psionic-energy-dice']);
  if(busy.current||!eligible(c)||!pool)return;busy.current=true;setPending(true);
  try{
   const discipline=findDiscipline(feature),options={active:()=>mounted.current&&latest.current.id===c.id,confirm:modal.confirm,warn:(message:string)=>showToast(message,'warn')};
   const prepared=discipline?await prepareDiscipline(persistence,latest,options):null;
   if(discipline&&!prepared)return;
   const source=prepared?.character??c,sides=psionicDieSides(psionProgression(source)?.level??0);
   // Guards spends a die without rolling it: no Surge or Enkindled offer.
   if(discipline?.id==='psionic-guards'){
    if(await beginDiscipline(persistence!,latest,prepared!,discipline.id,[],1,options)&&options.active())showToast('Psionic Guards active until your next turn. Charmed and Frightened protection is automatic.','success');
    return;
   }
   const original=rollDie(sides);
   const request={requestId:crypto.randomUUID(),operation:'spend' as const,count:1,rolls:[original],sourceFeature:feature,recoveryNote:'The base Energy Die was spent. Apply this saved roll manually; do not spend it again.'};
   let activationId:string|undefined;
   if(discipline){const paid=await beginDiscipline(persistence!,latest,prepared!,discipline.id as DisciplineId,[original],1,options);if(!paid)return;if(discipline.id==='sharpened-mind')activationId=paid.requestId;}
   else if(!await payPsionicEnergy(persistence,latest,request,options))return;
   const enhanced=await offerPsionicRollEnhancements({activationId,persistence,accept:receipt=>{acceptPsionicHitDiceReceipt(latest,receipt);},roll:original,sides,feature,recoveryNote:'The base Energy Die was already spent. Apply the rolled feature manually without spending it again.',campaignId:c.campaign_id,current:()=>latest.current,active:options.active,eligible,prompt:modal.prompt,confirm:modal.confirm,warn:message=>showToast(message,'warn')});
   if(enhanced?.unconfirmed)return;
   const total=enhanced?.roll??original,originals=enhanced?.originalRolls??[original];
   if(mounted.current&&latest.current.id===c.id){onRolled(total,sides);showToast(`${feature}: ${total}. Apply the feature at the table.`,'success');}
   const notes=`Manual feature roll; apply its effect at the table.${enhanced?.enkindledRolls.length?` Enkindled: ${enhanced.enkindledRolls.length} Hit Point Dice spent; extra Energy Dice not expended.`:''}${enhanced?.usedSurge?' Surge: low rolls treated as 4; 1 Hit Point Die spent.':''} Rolled ${originals.join(', ')}; total ${total} · ${pool-1} dice remaining`;
   const warn=()=>showToast(`${feature}: rolled ${total}, but history could not be saved. Keep this paid result.`,'warn');
   void logAction({campaignId:c.campaign_id??null,characterId:c.id,characterName:c.name,actionType:'roll',actionName:feature==='Psionic Energy Dice'?`Spent Psionic Energy Die (1d${sides})`:feature,diceExpression:`${originals.length}d${sides}`,individualResults:originals,total,notes}).then(result=>{if(result?.error)warn();}).catch(warn);
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 const pool=psionicPoolRemaining(psionProgression(character)?.level??0,character.class_resources?.['psionic-energy-dice']);
 return <button className="btn-ghost" style={{fontSize:11,minHeight:36,color:'#c4b5fd'}} disabled={pending||!eligible(character)||!pool} onClick={()=>void run()}>{pending?'Rolling…':label}</button>;
}
