import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {acceptPsionicHitDiceReceipt} from '../../../lib/characterRealtime';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
import {useToast} from '../../shared/Toast';
import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {useModal} from '../../shared/Modal';
import {rollDie} from '../../../rules/dice';
import {psionProgression} from '../../../rules/psionProgression';
import {psionicPowerState,type PsionicPowerUse} from '../../../rules/psionicPowers';
const buttonStyle={padding:'6px 8px',fontSize:11,minHeight:36,borderRadius:6,color:'#c4b5fd',background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.45)'};
export default function PsionicPowerButton({persistence,character,kind,onUse,onUpdate,warp=false}:{persistence?:PsionicEnhancementPersistence;character:Character;onUpdate:(patch:Partial<Character>)=>void;kind:'propel'|'connection';warp?:boolean;onUse:(use:PsionicPowerUse)=>Promise<void>}) {
  const modal=useModal(),latest=useOptimisticCharacterRef(character);
  const callback=useRef(onUse);callback.current=onUse;
  const update=useRef(onUpdate);update.current=onUpdate;
  const {showToast}=useToast();
  const busy=useRef(false);const [pending,setPending]=useState(false);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const state=psionicPowerState(character);
  // v2.869 — confirmation must not cross sheets, feature changes or level-ups.
  // An epoch also rejects changing away and back while the dialog is open.
  // Pool/HP updates intentionally do not invalidate a roll; their live guards
  // still run before payment, and paid enhancements update those fields.
  const contextKey=JSON.stringify([character.id,character.campaign_id??null,kind,warp,psionProgression(character)]);
  const context=useRef({key:contextKey,epoch:0});
  if(context.current.key!==contextKey)context.current={key:contextKey,epoch:context.current.epoch+1};
  async function run(mode:'free'|'powered'|'technique'|'connection') {
    if(busy.current||!psionicPowerState(latest.current).valid)return;busy.current=true;setPending(true);
    const id=latest.current.id,epoch=context.current.epoch;
    const active=()=>mounted.current&&latest.current.id===id&&context.current.epoch===epoch;
    try {
      const before=psionicPowerState(latest.current);
      if(mode==='connection'&&!before.connectionValid)return;
      if(mode==='connection' && !await modal.confirm({title:'Telepathic Connection',message:`Your base telepathy is ${before.telepathyRange} ft. Roll 1d${before.sides} to extend it by 10 times the roll for 1 hour. ${before.connectionFree?'This first extension after your Long Rest costs no die.':'This extension spends 1 Psionic Energy Die.'}`,confirmLabel:'Extend telepathy'}))return;
      if(!active())return;
      const now=psionicPowerState(latest.current);
      if(!now.valid||(warp&&!now.warp))return;
      if((mode==='powered'||mode==='connection')&&now.dice<1)return;
      if(mode==='connection'&&(!now.connectionValid||now.connectionFree!==before.connectionFree))return;
      if(mode==='technique'&&!now.technique)return;
      const originalRoll=mode==='free'?0:rollDie(mode==='technique'?4:now.sides);
      let roll=originalRoll,usedSurge=false;let enkindledRolls:number[]=[];
      // The free Psykinetic d4 is not a Psionic Energy Die (UA update p.9).
      if(mode==='powered'||mode==='connection') {
        const surged=await offerPsionicRollEnhancements({persistence,accept:receipt=>{acceptPsionicHitDiceReceipt(latest,receipt);},roll,sides:now.sides,
          recoveryNote:`Base power is not resolved. ${mode==='connection'&&now.connectionFree?'First Connection extension costs no Energy Die.':'Check the base Energy Die cost when resolving the power.'}`,
          feature:mode==='connection'?'Telepathic Connection':'Telekinetic Propel',campaignId:latest.current.campaign_id,
          current:()=>latest.current,active,
          eligible:c=>{const current=psionicPowerState(c);return current.valid&&current.dice>0&&(mode!=='connection'||(current.connectionValid&&current.connectionFree===now.connectionFree));},

          prompt:modal.prompt,confirm:modal.confirm,warn:message=>showToast(message,'warn')});
        if(!surged||surged.unconfirmed)return;
        roll=surged.roll;usedSurge=surged.usedSurge;enkindledRolls=surged.enkindledRolls;
      }
      if(!active())return;
      const current=psionicPowerState(latest.current);
      if(!current.valid||((mode==='powered'||mode==='connection')&&current.dice<1)||(mode==='connection'&&(!current.connectionValid||current.connectionFree!==now.connectionFree)))return;
      const metadata={...(usedSurge?{originalRoll,surged:true as const}:{}),...(enkindledRolls.length?{originalRoll,enkindledRolls}:{})};
      await callback.current(mode==='connection'?{kind:'connection',free:now.connectionFree,roll,...metadata}:
        {kind:'propel',mode,roll,...metadata,...(warp?{movement:'warp' as const}:{})});
    }finally{busy.current=false;if(mounted.current)setPending(false);}
  }
  return <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
    {kind==='connection'?<button style={buttonStyle} title={!state.connectionValid?'Check Telepathic Connection uses.':state.dice<1?'You need an available Psionic Energy Die to roll.':undefined} disabled={pending||!state.valid||!state.connectionValid||state.dice<1} onClick={()=>run('connection')}>{state.connectionFree?'Extend (free)':'Extend (1 die)'}</button>:<>
      <button style={buttonStyle} disabled={pending||!state.valid||(warp&&!state.warp)} onClick={()=>run('free')}>{warp?'Teleport (no die)':'Free 5 ft'}</button>
      {state.technique&&!warp&&<button style={buttonStyle} disabled={pending||!state.valid} onClick={()=>run('technique')}>Free d4</button>}
      <button style={buttonStyle} title={`Roll 1d${state.sides}; expend it only if the target fails its Strength save.`} disabled={pending||!state.valid||state.dice<1||(warp&&!state.warp)} onClick={()=>run('powered')}>Roll Energy Die</button>
    </>}
  </div>;
}
