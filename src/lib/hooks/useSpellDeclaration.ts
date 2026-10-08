import {useEffect,useRef,useState} from 'react';
import type {PendingSpellCast} from '../../types';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
import {declarePaidSpell,readDeclaredSpell,settlePaidSpell,type SpellSettlementReceipt} from '../api/declaredSpells';
import {offerCounterspell} from '../pendingReaction';
interface State {requestKey:string;cast:PendingSpellCast|null;offers:number|null;receipt:SpellSettlementReceipt|null;loading:boolean;error:string}
/** v2.804: reopening and StrictMode reuse the disk-backed cast ID. Observing a
 * terminal row is insufficient: only the settlement receipt releases effects.
 * No slot writes or effects occur here, so retries never replay those actions. */
export function useSpellDeclaration(request:SpellDeclarationRequest,onDeclared:()=>void,beforeDeclare?:()=>Promise<void>){
 const requestKey=JSON.stringify(request),[attempt,setAttempt]=useState(0);
 const empty:State={requestKey,cast:null,offers:null,receipt:null,loading:true,error:''};
 const [state,setState]=useState<State>(empty),callback=useRef(onDeclared),announced=useRef(new Set<string>()),prepare=useRef(beforeDeclare);callback.current=onDeclared;prepare.current=beforeDeclare;
 useEffect(()=>{
  const captured=JSON.parse(requestKey) as SpellDeclarationRequest;
  let stopped=false,running=false,halted=false,confirmed=false,offered=false,timedOut=false,startedAt=0;
  const patch=(next:Partial<State>)=>{if(!stopped)setState(previous=>({...previous,...next,requestKey}));};
  setState({requestKey,cast:null,offers:null,receipt:null,loading:true,error:''});
  async function refresh(){
   if(stopped||running||halted)return;running=true;startedAt=Date.now();
   try{
    if(!confirmed){
     await prepare.current?.();if(stopped||timedOut)return;
     const cast=await declarePaidSpell(captured);if(stopped||timedOut)return;confirmed=true;patch({cast});
     if(!announced.current.has(captured.castId)){announced.current.add(captured.castId);callback.current();}
     if(cast.state!=='declared')offered=true;
    }
    if(!offered){
     const status=await readDeclaredSpell(captured);if(stopped||timedOut)return;
     if(status.cast.state==='declared'&&!status.readyToSettle){
      const cast=status.cast;
      const offers=await offerCounterspell({pendingSpellCastId:cast.id,campaignId:cast.campaign_id,encounterId:cast.encounter_id,
       casterParticipantId:cast.caster_participant_id,casterName:cast.caster_name,spellName:cast.spell_name,spellLevel:cast.spell_level});
      if(stopped||timedOut)return;patch({offers});
     }
     offered=true;
    }
    const status=await readDeclaredSpell(captured);if(stopped||timedOut)return;patch({cast:status.cast,loading:false});
    if(status.readyToSettle){
     const receipt=await settlePaidSpell(captured.castId);if(stopped||timedOut)return;
     if('legacy' in receipt)throw new Error('This cast has no verified payment receipt. Review it before applying effects.');
     halted=true;patch({receipt});
    }
   }catch(error){if(stopped||timedOut)return;halted=true;patch({loading:false,error:error instanceof Error?error.message:'The casting could not be confirmed. Retry the saved request.'});}
   finally{running=false;}
  }
  void refresh();const timer=setInterval(()=>{
   if(running&&!halted&&Date.now()-startedAt>=15_000){
    timedOut=true;halted=true;patch({loading:false,error:'Confirmation is taking too long. Retry or reopen this saved casting; its original request is preserved.'});return;
   }
   void refresh();
  },1000);
  return()=>{stopped=true;clearInterval(timer);};
 },[requestKey,attempt]);
 return {...(state.requestKey===requestKey?state:empty),retry:()=>setAttempt(value=>value+1)};
}
