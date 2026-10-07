import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {useModal} from '../../shared/Modal';
import {psionicRestorationStatus,restorePsionicDice} from '../../../rules/psionicRestoration';

export default function PsionicRestorationButton({character,onUpdate}:{character:Character;onUpdate:(patch:Partial<Character>)=>void}) {
  const modal=useModal();
  const current=useRef(character);current.current=character;
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
      const patch=restorePsionicDice(current.current);
      if(!patch)return;
      // Guard repeat events before the parent's updated props reach this button.
      current.current={...current.current,...patch} as Character;
      onUpdate(patch as Partial<Character>);
    }finally{locked.current=false;if(mounted.current)setPending(false);}
  }
  return <button type="button" onClick={meditate} disabled={pending || !!status.reason}
    title={status.reason??`Recover ${status.recovered} Psionic Energy Dice after 1 minute`}
    style={{padding:'6px 10px',fontSize:11,minHeight:36,borderRadius:6,color:'#c4b5fd',background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.45)'}}>
    {status.reason??'Meditate (1 min)'}
  </button>;
}
