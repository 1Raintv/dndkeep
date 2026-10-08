import {useEffect,useState} from 'react';
import type {Character,PendingReaction} from '../../types';
import {loadReactionCharacter} from '../api/reactionCharacter';
import {counterspellCasting,selectedCounterspellCasting} from '../counterspellCasting';

/** v2.802 — Offer-keyed state prevents the previous reactor's stats/slots from
 * enabling a new prompt. A failed lookup stays unavailable and can be retried. */
export function useCounterspellChoice(offer:PendingReaction|null){
 const id=offer?.reaction_key==='counterspell'?offer.id:null;
 const participantId=id?offer?.reactor_participant_id:null;
 const [attempt,retry]=useState(0);
 const requestKey=JSON.stringify([id,participantId,attempt]);
 const [loaded,setLoaded]=useState<{key:string;character:Character|null;error:boolean}|null>(null);
 const [choice,choose]=useState<{id:string|null;key:string}>({id:null,key:''});
 useEffect(()=>{
  if(!id||!participantId){setLoaded(null);return;}
  let active=true;
  const timeout=setTimeout(()=>{if(active){active=false;setLoaded({key:requestKey,character:null,error:true});}},15_000);
  loadReactionCharacter(participantId).then(character=>{
   if(active){clearTimeout(timeout);setLoaded({key:requestKey,character,error:false});}
  }).catch(()=>{if(active){clearTimeout(timeout);setLoaded({key:requestKey,character:null,error:true});}});
  return()=>{active=false;clearTimeout(timeout);};
 },[id,participantId,requestKey]);
 const current=loaded?.key===requestKey?loaded:null;
 const character=current?.character??null;
 const key=choice.id===id?choice.key:undefined;
 return {character,loading:!!id&&!current,error:!!current?.error,
  options:character?counterspellCasting(character).options:[],
  selected:character?selectedCounterspellCasting(character,key):null,
  choose:(key:string)=>choose({id,key}),retry:()=>retry(n=>n+1)};
}
