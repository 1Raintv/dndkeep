import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import type {PsionDiscipline} from '../../../data/psionDisciplines';
import {hasDiscipline} from '../../../data/psionDisciplines';
import {conditionalPsionicDie} from '../../../rules/conditionalPsionicDie';
import {psionicSurge} from '../../../rules/psionicSurge';
import {rollDie} from '../../../rules/dice';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {logAction} from '../../shared/ActionLog';
/** Rolls first, then asks for the tabletop outcome; dismissing never spends. */
export default function ConditionalPsionicButton({character,discipline,onUpdate,campaignId}:{character:Character;discipline:PsionDiscipline;onUpdate:(patch:Partial<Character>)=>void;campaignId?:string|null}) {
 const latest=useRef(character);latest.current=character;
 const update=useRef(onUpdate);update.current=onUpdate;
 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const state=conditionalPsionicDie(character.level,character.class_resources?.['psionic-energy-dice'],1,false);
 async function run() {
  if(busy.current||!state)return;busy.current=true;setPending(true);
  const id=latest.current.id;
  try {
   const originalRoll=rollDie(state.sides);
   let roll=originalRoll,usedSurge=false;
   if(psionicSurge(latest.current,[roll])) {
    const useSurge=await modal.confirm({title:'Psionic Surge',
     message:`${discipline.name}: rolled ${roll} on 1d${state.sides}. Spend 1 Hit Point Die to treat this roll as 4? This does not heal you. The Hit Point Die is spent even if the bonus does not change the outcome; the Psionic Energy Die still follows the discipline's normal cost.`,
     confirmLabel:'Spend 1 Hit Point Die',cancelLabel:`Keep roll of ${roll}`});
    if(!mounted.current||latest.current.id!==id)return;
    if(useSurge) {
     const current=latest.current;
     const chosen=(current.class_resources as Record<string,unknown>|null)?.['psion-disciplines'];
     const surge=psionicSurge(current,[originalRoll]);
     if(!surge||!Array.isArray(chosen)||!hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline)||!conditionalPsionicDie(current.level,current.class_resources?.['psionic-energy-dice'],originalRoll,false)) {
      showToast('Resources changed. Psionic Surge was not applied.','warn');return;
     }
     // Spend at the Surge decision, not at the later conditional-outcome decision.
     // Keeping the Energy Die must never refund an already-used Hit Point Die.
     const patch={hit_dice_spent:surge.hit_dice_spent};
     latest.current={...current,...patch};update.current(patch);
     roll=surge.rolls[0];usedSurge=true;
     await logAction({campaignId:campaignId??null,characterId:current.id,characterName:current.name,actionType:'roll',actionName:'Psionic Surge',total:roll,individualResults:[originalRoll],notes:`${discipline.name}: ${originalRoll} treated as ${roll}; spent 1 Hit Point Die. No healing or Energy Die expenditure.`});
     if(!mounted.current||latest.current.id!==id)return;
    }
   }
   const hit=discipline.conditionalOutcome==='hit';
   const changed=await modal.confirm({title:discipline.name,
    message:`${discipline.description}\n\n${usedSurge?`Rolled ${originalRoll} on 1d${state.sides}; Psionic Surge treats it as ${roll} (1 Hit Point Die spent).`:`Rolled ${roll} on 1d${state.sides}.`} Add +${roll} to the ${hit?'missed attack':'ability check'}. Did this bonus turn it into ${hit?'a hit':'a success'}? Spend the die only if it changed the outcome. You can use only one Discipline each turn, once that turn, unless an option says otherwise.`,
    confirmLabel:hit?'Changed to hit · spend 1':'Changed to success · spend 1',cancelLabel:'Keep die'});
   if(!mounted.current||latest.current.id!==id)return;
   const current=latest.current;
   const chosen=(current.class_resources as Record<string,unknown>|null)?.['psion-disciplines'];
   if(current.class_name!=='Psion'||!Array.isArray(chosen)||!hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline))return;
   const result=conditionalPsionicDie(current.level,current.class_resources?.['psionic-energy-dice'],roll,changed);
   if(!result){showToast('Resources changed. Check your Psionic Energy Dice before resolving this bonus.','warn');return;}
   if(result.cost){
    const patch={class_resources:{...current.class_resources,'psionic-energy-dice':result.remaining}};
    latest.current={...current,...patch};update.current(patch);
   }
   const notes=`${discipline.name}: +${roll} bonus.${usedSurge?' Psionic Surge: 1 Hit Point Die spent.':''} ${result.cost?'Confirmed changed outcome; spent 1 die.':'No die spent.'}`;
   showToast(notes,'success');
   await logAction({campaignId:campaignId??null,characterId:current.id,characterName:current.name,actionType:'roll',actionName:discipline.name,total:roll,individualResults:[originalRoll],notes});
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 return <button className="btn-ghost" style={{fontSize:11,minHeight:36,padding:'4px 8px',color:'#c4b5fd'}} disabled={pending||!state} title="Roll a bonus; spend the die only if it changes the outcome" onClick={()=>void run()}>Roll bonus</button>;
}
