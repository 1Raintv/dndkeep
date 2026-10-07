import {payPsionicEnergy} from './payPsionicEnergy';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {acceptPsionicHitDiceReceipt} from '../../../lib/characterRealtime';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import type {PsionDiscipline} from '../../../data/psionDisciplines';
import {hasDiscipline} from '../../../data/psionDisciplines';
import {conditionalPsionicDie} from '../../../rules/conditionalPsionicDie';
import {psionicSurge} from '../../../rules/psionicSurge';
import {enkindledCapacity} from '../../../rules/enkindledLifeForce';
import {psionicRollNote} from '../../../rules/psionicEnhancedRoll';
import {rollDie} from '../../../rules/dice';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {logAction} from '../../shared/ActionLog';
/** Rolls first, then asks for the tabletop outcome; dismissing never spends. */
export default function ConditionalPsionicButton({persistence,character,discipline,campaignId}:{persistence?:PsionicEnhancementPersistence;character:Character;discipline:PsionDiscipline;onUpdate:(patch:Partial<Character>)=>void;campaignId?:string|null}) {
 const latest=useOptimisticCharacterRef(character);
 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const state=conditionalPsionicDie(character.level,character.class_resources?.['psionic-energy-dice'],1,false);
 async function run() {
  if(busy.current||!state)return;busy.current=true;setPending(true);
  const id=latest.current.id;
  try {
   const originalRoll=rollDie(state.sides);
   let roll=originalRoll,usedSurge=false;let enkindledRolls:number[]=[];
   if(psionicSurge(latest.current,[roll])||enkindledCapacity(latest.current)) {
    const surged=await offerPsionicRollEnhancements({persistence,accept:receipt=>{acceptPsionicHitDiceReceipt(latest,receipt);},roll,sides:state.sides,feature:discipline.name,campaignId,recoveryNote:'The bonus outcome is not resolved. Spend the base Energy Die only if it changes the outcome.',
     current:()=>latest.current,active:()=>mounted.current,
     eligible:current=>{
      const chosen=(current.class_resources as Record<string,unknown>|null)?.['psion-disciplines'];
      return Array.isArray(chosen)&&hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline)
       &&!!conditionalPsionicDie(current.level,current.class_resources?.['psionic-energy-dice'],originalRoll,false);
     },

     prompt:modal.prompt,confirm:modal.confirm,warn:message=>showToast(message,'warn')});
    if(!surged||surged.unconfirmed)return;
    roll=surged.roll;usedSurge=surged.usedSurge;enkindledRolls=surged.enkindledRolls;
   }
   if(!mounted.current||latest.current.id!==id)return;
   const enhancement={originalRoll,surged:usedSurge,enkindledRolls};
   const extraNote=enkindledRolls.length?psionicRollNote(roll,enhancement):'';
   const hit=discipline.conditionalOutcome==='hit';
   const changed=await modal.confirm({title:discipline.name,
    message:`${discipline.description}\n\n${extraNote?extraNote:usedSurge?`Rolled ${originalRoll} on 1d${state.sides}; Psionic Surge treats it as ${roll} (1 Hit Point Die spent).`:`Rolled ${roll} on 1d${state.sides}.`} Add +${roll} to the ${hit?'missed attack':'ability check'}. Did this bonus turn it into ${hit?'a hit':'a success'}? Spend the die only if it changed the outcome. You can use only one Discipline each turn, once that turn, unless an option says otherwise.`,
    confirmLabel:hit?'Changed to hit · spend 1':'Changed to success · spend 1',cancelLabel:'Keep die'});
   if(!mounted.current||latest.current.id!==id)return;
   const current=latest.current;
   const chosen=(current.class_resources as Record<string,unknown>|null)?.['psion-disciplines'];
   if(current.class_name!=='Psion'||!Array.isArray(chosen)||!hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline))return;
   const result=conditionalPsionicDie(current.level,current.class_resources?.['psionic-energy-dice'],roll,changed,enhancement);
   if(!result){showToast('Resources changed. Check your Psionic Energy Dice before resolving this bonus.','warn');return;}
   if(result.cost){
    if(!await payPsionicEnergy(persistence,latest,{requestId:crypto.randomUUID(),operation:'spend',count:1,rolls:[originalRoll],sourceFeature:discipline.name,
     recoveryNote:`Confirmed that +${roll} changed the ${hit?'attack to a hit':'check to a success'}. The base die is spent; do not spend it again.`},
     {active:()=>mounted.current&&latest.current.id===id,confirm:modal.confirm,warn:message=>showToast(message,'warn')}))return;
   }
   const notes=`${discipline.name}: +${roll} bonus. ${extraNote}${usedSurge&&!extraNote?' Psionic Surge: 1 Hit Point Die spent.':''} ${result.cost?'Confirmed changed outcome; spent 1 die.':'No die spent.'}`;
   showToast(notes,'success');
   const warnLog=()=>showToast(`${discipline.name}: bonus ${roll} resolved, but its history could not be saved.`,'warn');
   void logAction({campaignId:campaignId??null,characterId:current.id,characterName:current.name,actionType:'roll',actionName:discipline.name,total:roll,individualResults:[originalRoll,...enkindledRolls],notes}).then(result=>{if(result?.error)warnLog();}).catch(warnLog);
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 return <button className="btn-ghost" style={{fontSize:11,minHeight:36,padding:'4px 8px',color:'#c4b5fd'}} disabled={pending||!state} title="Roll a bonus; spend the die only if it changes the outcome" onClick={()=>void run()}>Roll bonus</button>;
}
