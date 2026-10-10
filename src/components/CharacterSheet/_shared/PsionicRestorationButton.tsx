import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {payPsionicEnergy} from './payPsionicEnergy';
import {useToast} from '../../shared/Toast';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {useModal} from '../../shared/Modal';
import {psionicRestorationStatus} from '../../../rules/psionicRestoration';

export default function PsionicRestorationButton({persistence,character}:{persistence?:PsionicEnhancementPersistence;character:Character;onUpdate:(patch:Partial<Character>)=>void}) {
  const modal=useModal();
  const current=useOptimisticCharacterRef(character);const {showToast}=useToast();
  const locked=useRef(false),mounted=useRef(true);
  const [pending,setPending]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const status=psionicRestorationStatus(character);
  async function meditate(){
    if(locked.current || psionicRestorationStatus(current.current).reason)return;
    locked.current=true;setPending(true);
    const characterId=current.current.id;
    try {
      const completed=await modal.confirm({title:'Psionic Restoration',
        message:'After your character completes a 1-minute meditation, restore all expended Psionic Energy Dice. This uses Psionic Restoration until your next Long Rest.',
        confirmLabel:'Complete meditation'});
      if(!completed || !mounted.current || current.current.id!==characterId)return;
      if(psionicRestorationStatus(current.current).reason)return;
      await payPsionicEnergy(persistence,current,{requestId:crypto.randomUUID(),operation:'restore',count:0,rolls:[],sourceFeature:'Psionic Restoration',recoveryNote:'Completed the 1-minute meditation. Confirm this saved use; do not restore the dice a second time.'},
       {active:()=>mounted.current&&current.current.id===characterId,confirm:modal.confirm,warn:message=>showToast(message,'warn')});
    }finally{locked.current=false;if(mounted.current)setPending(false);}
  }
  return <button type="button" onClick={meditate} disabled={pending || !!status.reason}
    title={status.reason??`Recover ${status.recovered} Psionic Energy Dice after 1 minute`}
    style={{minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere',padding:'6px 10px',fontSize:11,minHeight:36,borderRadius:6,color:'#c4b5fd',background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.45)'}}>
    {status.reason??'Meditate (1 min)'}
  </button>;
}
