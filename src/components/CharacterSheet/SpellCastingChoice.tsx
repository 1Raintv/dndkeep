import type {SpellCastingState} from './SpellCastingContext';
/** A choice affects this spell's casts in both sheet tabs; it never rewrites ownership. */
export function SpellCastingChoice({casting,name}:{casting:SpellCastingState;name:string}){
 if(casting.options.length===1&&casting.selected&&!casting.unresolvedSources.length)return null;
 return <div style={{maxWidth:280,fontSize:12}} onClick={event=>event.stopPropagation()}>
  {casting.options.length>0&&<label>Cast through
   <select aria-label={`Cast ${name} through`} value={casting.selected?.key??''} onChange={event=>casting.choose(event.target.value)} style={{display:'block',maxWidth:'100%'}}>
    <option value="">Choose a spell source</option>
    {casting.options.map(option=><option key={option.key} value={option.key}>{option.label} · {option.ability.slice(0,3).toUpperCase()} · DC {option.saveDC}</option>)}
   </select>
  </label>}
  {casting.needsSourceReview&&<p>Review this spell’s learned and prepared sources in the Spells tab before casting.</p>}
  {!!casting.unresolvedSources.length&&!casting.selected&&<p>For a species, feat, or other source, choose the casting ability specified by that feature.</p>}
  {!casting.options.length&&!casting.needsSourceReview&&!casting.unresolvedSources.length&&<p>No prepared casting source for this spell.</p>}
 </div>;
}
