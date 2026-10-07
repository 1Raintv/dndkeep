import type {usePsionLevelUpSpells} from '../../lib/hooks/usePsionLevelUpSpells';

export default function PsionLevelUpSpellChoices({choices}:{choices:ReturnType<typeof usePsionLevelUpSpells>}){
 if(!choices.enabled)return null;
 return <section aria-label="Psion spell replacements" style={{marginTop:16,padding:12,border:'1px solid var(--c-border)',borderRadius:8}}>
  <h3 style={{margin:'0 0 8px'}}>Replace Psion spells</h3>
  <p style={{fontSize:12,color:'var(--t-2)'}}>Optional: replace one cantrip and one prepared spell as you gain this Psion level. Automatically granted spells stay with you.</p>
  {(['cantrip','spell'] as const).map(kind=>{
   const old=choices.outgoing.filter(s=>(s.level===0)===(kind==='cantrip'));
   const next=choices.incoming.filter(s=>(s.level===0)===(kind==='cantrip'));
   const swap=choices.swaps[kind];const label=kind==='cantrip'?'cantrip':'prepared spell';
   return <div key={kind} style={{display:'flex',flexDirection:'column',gap:6,marginTop:12}}>
    <label>Replace {label}
     <select aria-label={`Replace ${label}`} value={swap?.from??''} style={{display:'block',width:'100%'}}
      onChange={e=>choices.setSwaps(prev=>({...prev,[kind]:e.target.value?{from:e.target.value,to:''}:undefined}))}>
      <option value="">Keep current {kind==='cantrip'?'cantrips':'spells'}</option>
      {old.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </label>
    {swap&&<label>New {label}
     <select aria-label={`New ${label}`} value={swap.to} style={{display:'block',width:'100%'}}
      onChange={e=>choices.setSwaps(prev=>({...prev,[kind]:{from:swap.from,to:e.target.value}}))}>
      <option value="">Choose a replacement</option>
      {next.map(s=><option key={s.id} value={s.id}>{s.name}{s.level?` (level ${s.level})`:''}</option>)}
     </select>
    </label>}
   </div>;
  })}
  {choices.error&&<p role="alert" style={{fontSize:12,color:'var(--c-red)'}}>{choices.error}</p>}
 </section>;
}
