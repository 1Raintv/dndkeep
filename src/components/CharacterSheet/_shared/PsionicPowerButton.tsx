import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {useModal} from '../../shared/Modal';
import {rollDie} from '../../../rules/dice';
import {psionicPowerState,type PsionicPowerUse} from '../../../rules/psionicPowers';
const buttonStyle={padding:'6px 8px',fontSize:11,minHeight:36,borderRadius:6,color:'#c4b5fd',background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.45)'};
export default function PsionicPowerButton({character,kind,onUse}:{character:Character;kind:'propel'|'connection';onUse:(use:PsionicPowerUse)=>Promise<void>}) {
  const modal=useModal(),latest=useRef(character);latest.current=character;
  const callback=useRef(onUse);callback.current=onUse;
  const busy=useRef(false);const [pending,setPending]=useState(false);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const state=psionicPowerState(character);
  async function run(mode:'free'|'powered'|'technique'|'connection') {
    if(busy.current)return;busy.current=true;setPending(true);
    const id=latest.current.id;
    try {
      const before=psionicPowerState(latest.current);
      if(mode==='connection' && !await modal.confirm({title:'Telepathic Connection',message:`Your base telepathy is ${before.telepathyRange} ft. Roll 1d${before.sides} to extend it by 10 times the roll for 1 hour. ${before.connectionFree?'This first extension after your Long Rest costs no die.':'This extension spends 1 Psionic Energy Die.'}`,confirmLabel:'Extend telepathy'}))return;
      if(!mounted.current||latest.current.id!==id)return;
      const now=psionicPowerState(latest.current);
      if((mode==='powered'||mode==='connection')&&now.dice<1)return;
      if(mode==='connection'&&now.connectionFree!==before.connectionFree)return;
      if(mode==='technique'&&!now.technique)return;
      await callback.current(mode==='connection'?{kind:'connection',free:now.connectionFree,roll:rollDie(now.sides)}:
        {kind:'propel',mode,roll:mode==='free'?0:rollDie(mode==='technique'?4:now.sides)});
    }finally{busy.current=false;if(mounted.current)setPending(false);}
  }
  return <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
    {kind==='connection'?<button style={buttonStyle} title={state.dice<1?'You need an available Psionic Energy Die to roll.':undefined} disabled={pending||state.dice<1} onClick={()=>run('connection')}>{state.connectionFree?'Extend (free)':'Extend (1 die)'}</button>:<>
      <button style={buttonStyle} disabled={pending} onClick={()=>run('free')}>Free 5 ft</button>
      {state.technique&&<button style={buttonStyle} disabled={pending} onClick={()=>run('technique')}>Free d4</button>}
      <button style={buttonStyle} disabled={pending||state.dice<1} onClick={()=>run('powered')}>Powered (1 die)</button>
    </>}
  </div>;
}
