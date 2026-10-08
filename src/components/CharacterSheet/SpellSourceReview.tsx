import {useEffect,useState} from 'react';
import type {Character,SpellData} from '../../types';
import {isSpellSources,type SpellSource} from '../../rules/spellSources';
import {reviewCharacterSpellSources} from '../../lib/reviewCharacterSpellSources';
import {psionSpellReplacementContext} from '../../lib/psionSpellReplacementContext';

/** v2.787 — Older records have no per-class provenance. Review is explicit and
 * stays a draft until saved; changing the selected spell discards its draft. */
export default function SpellSourceReview({character,spells,onSave,initialSpellId=''}:{character:Character;spells:SpellData[];initialSpellId?:string;onSave:(patch:Partial<Character>)=>void}){
 const [id,setId]=useState(initialSpellId);const [owners,setOwners]=useState<SpellSource[]>([]);const [ready,setReady]=useState<SpellSource[]>([]);
 const [message,setMessage]=useState('');
 useEffect(()=>{setOwners(isSpellSources(character.spell_sources??{})?[...(character.spell_sources?.[id]??[])]:[]);setReady(isSpellSources(character.spell_preparation_sources??{})?[...(character.spell_preparation_sources?.[id]??[])]:[]);setMessage('');},[id,character.id,character.spell_sources,character.spell_preparation_sources]);
 const granted=psionSpellReplacementContext(character,character.level).granted;
 const reviewable=spells.filter(spell=>character.known_spells.includes(spell.id)&&!granted.includes(spell.id));
 const spell=reviewable.find(item=>item.id===id);
 const options=[...new Set<SpellSource>([`class:${character.class_name}`,...(character.secondary_class?[`class:${character.secondary_class}` as SpellSource]:[]),'feat','species','other'])];
 return <details open={initialSpellId?true:undefined} style={{padding:12,border:'1px solid var(--c-border)',borderRadius:8}}>
  <summary>Review spell sources</summary>
  <p style={{fontSize:12}}>For older or imported spells, confirm how you learned each spell and which sources have it prepared. This does not learn additional spells.</p>
  <label>Spell to review<select aria-label="Spell to review" value={id} onChange={event=>setId(event.target.value)} style={{display:'block',width:'100%',marginTop:6}}>
   <option value="">Choose a learned spell</option>{reviewable.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
  </select></label>
  {spell&&<form aria-label="Spell source review" onSubmit={event=>{event.preventDefault();const result=reviewCharacterSpellSources(character,id,owners,ready);if(!result.ok){setMessage(result.reason);return;}onSave(result.patch);setId('');}}>
   <fieldset style={{margin:'12px 0',padding:8,border:'1px solid var(--c-border)'}}><legend>Learned through</legend>
    {options.map(source=><label key={source} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 0'}}>
     <input type="checkbox" aria-label={`Learned through ${source.replace('class:','')}`} style={{width:16,height:16,margin:0}} checked={owners.includes(source)} onChange={event=>{setOwners(event.target.checked?[...owners,source]:owners.filter(item=>item!==source));setReady(ready.filter(item=>item!==source));}}/>{source.replace('class:','')}
    </label>)}
   </fieldset>
   {spell.level>0&&<fieldset style={{margin:'12px 0',padding:8,border:'1px solid var(--c-border)'}}><legend>Prepared through</legend>
    <p style={{fontSize:12}}>Check every prepared source. Leave all unchecked if the spell is learned but unprepared.</p>
    {owners.map(source=><label key={source} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 0'}}>
     <input type="checkbox" aria-label={`Prepared through ${source.replace('class:','')}`} style={{width:16,height:16,margin:0}} checked={ready.includes(source)} onChange={event=>setReady(event.target.checked?[...ready,source]:ready.filter(item=>item!==source))}/>{source.replace('class:','')}
    </label>)}
   </fieldset>}
   {message&&<p role="alert">{message}</p>}
   <button type="submit" className="btn btn-primary">Save spell sources</button>
   <button type="button" className="btn btn-secondary" style={{marginLeft:8}} onClick={()=>setId('')}>Cancel review</button>
  </form>}
 </details>;
}
