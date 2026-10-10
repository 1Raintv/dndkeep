import {useEffect,useState} from 'react';
import {creatureSaveBonus,type CreatureSaveStats} from '../../rules/creatureSaveBonus';
import {readCreatureSaveDefinition} from '../../lib/api/creatureSaveDefinition';
const abilities=['STR','DEX','CON','INT','WIS','CHA'];
export function CreatureSaveSummary({definition,loading=false}:{definition:CreatureSaveStats|null;loading?:boolean}){
 const values=abilities.map(ability=>({ability,result:loading?null:creatureSaveBonus(ability,definition)}));
 return <section aria-label="Saving throws" style={{minWidth:0}}>
  <div style={{fontSize:10,color:'var(--t-3)',marginBottom:5}}>Saving throws</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:3}}>
   {values.map(({ability,result})=><div key={ability} title={result?.breakdown??(loading?'Loading saving throws':'Review needed')} aria-label={`${ability} ${result?`${result.bonus>=0?'+':''}${result.bonus}`:loading?'loading':'review needed'}`} style={{padding:'5px 1px',textAlign:'center',background:'var(--c-raised)',border:'1px solid var(--c-border)',borderRadius:4}}>
    <div style={{fontSize:9,color:'var(--t-3)',fontWeight:700}}>{ability}</div>
    <div style={{fontSize:13,fontWeight:700,color:result?'var(--t-1)':'#fbbf24'}}>{result?`${result.bonus>=0?'+':''}${result.bonus}`:loading?'…':'?'}</div>
   </div>)}
  </div>
  {loading?<div role="status" style={{fontSize:11,marginTop:5}}>Loading saving throws…</div>:values.some(v=>!v.result)&&<div style={{fontSize:11,color:'#fbbf24',marginTop:5}}>Review missing save data before rolling.</div>}
 </section>;
}
/** v2.869: read the linked source once, not six separate bonus queries. Ignore
 * late replies from a prior actor; never show that actor's numbers on this one. */
export function ParticipantSaveSummary({participant}:{participant:{id:string;campaign_id:string;entity_id:string|null;combatant_id?:string|null}}){
 const [state,setState]=useState<{participant:typeof participant;definition:CreatureSaveStats|null}|null>(null);
 useEffect(()=>{let active=true;readCreatureSaveDefinition(participant).then(definition=>{if(active)setState({participant,definition});}).catch(()=>{if(active)setState({participant,definition:null});});return()=>{active=false;};},[participant]);
 const current=state?.participant===participant;
 return <CreatureSaveSummary definition={current?state.definition:null} loading={!current}/>;
}
