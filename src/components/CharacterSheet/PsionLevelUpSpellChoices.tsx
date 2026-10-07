import type {SpellSource} from '../../rules/psionSpellChoices';
import type {usePsionLevelUpSpells} from '../../lib/hooks/usePsionLevelUpSpells';

export default function PsionLevelUpSpellChoices({choices}:{choices:ReturnType<typeof usePsionLevelUpSpells>}){
 if(!choices.enabled)return null;
 function sourceReview(id:string,name:string){return <fieldset key={id} style={{margin:'8px 0',padding:8,border:'1px solid var(--c-border)'}}>
  <legend>{name}: learned through</legend>
  {choices.sourceOptions.map(source=><label key={source} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:12}}>
   <input type="checkbox" style={{width:16,height:16,margin:0,flexShrink:0}} aria-label={`${name}: ${source.replace('class:','')}`} checked={choices.sources[id]?.includes(source)??false}
    onChange={e=>choices.setSources(previous=>{const selected=new Set<SpellSource>(previous[id]??[]);if(e.target.checked)selected.add(source);else selected.delete(source);return {...previous,[id]:[...selected]};})}/>
   {source.replace('class:','')}
  </label>)}
 </fieldset>;}
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
    {swap&&sourceReview(swap.from,old.find(s=>s.id===swap.from)?.name??swap.from)}
    {swap&&<label>New {label}
     <select aria-label={`New ${label}`} value={swap.to} style={{display:'block',width:'100%'}}
      onChange={e=>choices.setSwaps(prev=>({...prev,[kind]:{from:swap.from,to:e.target.value}}))}>
      <option value="">Choose a replacement</option>
      {next.map(s=><option key={s.id} value={s.id}>{s.name}{s.level?` (level ${s.level})`:''}</option>)}
     </select>
    </label>}
   </div>;
  })}
  <details style={{marginTop:12}}><summary>Review existing spell sources</summary>
   <p style={{fontSize:12}}>Select every class or feature that taught you each spell. A shared spell stays available through its other sources after replacement.</p>
   {choices.reviewable.filter(s=>s.id!==choices.swaps.cantrip?.from&&s.id!==choices.swaps.spell?.from).map(s=>sourceReview(s.id,s.name))}
  </details>
  {choices.error&&<p role="alert" style={{fontSize:12,color:'var(--c-red)'}}>{choices.error}</p>}
 </section>;
}
