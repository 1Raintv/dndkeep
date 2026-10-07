import {PSIONIC_SPELLCASTING_TEXT,SUBTLE_TELEKINESIS_TEXT} from '../../../data/psionFeatureDescriptions';
/** Shared reference for Actions and Spells: keep the base spell intact. */
export default function PsionCastingNote({subtle=false}:{subtle?:boolean}) {
 return <aside aria-label="Psion casting rules" style={{fontSize:12,lineHeight:1.6,color:'var(--t-2)',borderLeft:'2px solid #a78bfa',padding:'6px 10px',marginBottom:12}}>
  <strong style={{color:'#c4b5fd'}}>Psionic Spellcasting. </strong>{PSIONIC_SPELLCASTING_TEXT}
  {subtle&&<div style={{marginTop:6}}><strong style={{color:'#c4b5fd'}}>Subtle Telekinesis. </strong>{SUBTLE_TELEKINESIS_TEXT}</div>}
 </aside>;
}
