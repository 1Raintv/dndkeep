import {isSpellSources,type SpellSources,type SpellGrantSource} from './spellSources';
import type {SpellPreparationSources} from './spellPreparation';
export interface AutomaticSpellGrant {id:string;source:SpellGrantSource;prepared:boolean}
const isGrant=(source:string)=>source.startsWith('grant:');

/** v2.787 — Grant tags are independent of deliberately learned copies. Only
 * tracked grants can expire automatically. Legacy list membership does not
 * prove a spell was granted; keep such entries for explicit source review. */
export function reconcileSpellGrants(input:{known:readonly string[];prepared:readonly string[];
 sources:SpellSources;preparationSources:SpellPreparationSources;grants:readonly AutomaticSpellGrant[]}):
 {ok:true;known:string[];prepared:string[];sources:SpellSources;preparationSources:SpellPreparationSources}|{ok:false;reason:string}{
 if(!isSpellSources(input.sources)||!isSpellSources(input.preparationSources)||input.grants.some(grant=>!isGrant(grant.source)||!isSpellSources({[grant.id]:[grant.source]})))
  return {ok:false,reason:'Automatic spell sources could not be read.'};
 const known=new Set(input.known),prepared=new Set(input.prepared);
 const sources:SpellSources={...input.sources},preparationSources:SpellPreparationSources={...input.preparationSources};
 const active=(id:string,source:string)=>input.grants.some(grant=>grant.id===id&&grant.source===source);
 for(const [id,owners] of Object.entries(sources)){
  const remaining=owners.filter(source=>!isGrant(source)||active(id,source));
  if(remaining.length===owners.length)continue;
  if(!remaining.length){delete sources[id];delete preparationSources[id];known.delete(id);prepared.delete(id);continue;}
  sources[id]=remaining;
  if(Object.prototype.hasOwnProperty.call(preparationSources,id)){
   const ready=preparationSources[id].filter(source=>remaining.includes(source));
   preparationSources[id]=ready;if(ready.length)prepared.add(id);else prepared.delete(id);
  }
 }
 // Readiness can be known even when learned ownership is still legacy-unknown
 // (for example, an unprepared old spell made ready by a newly active grant).
 for(const [id,ready] of Object.entries(preparationSources)){
  const remaining=ready.filter(source=>!isGrant(source)||input.grants.some(grant=>grant.id===id&&grant.source===source&&grant.prepared));
  if(remaining.length!==ready.length){preparationSources[id]=remaining;if(remaining.length)prepared.add(id);else prepared.delete(id);}
 }
 for(const grant of input.grants){
  const existed=known.has(grant.id),wasPrepared=prepared.has(grant.id);
  const reviewedOwnership=!!sources[grant.id]?.length;
  // Do not turn an unknown legacy choice into a grant-only entry, which could
  // later be deleted on a level/subclass/species change.
  if(!existed||reviewedOwnership)sources[grant.id]=[...new Set([...(sources[grant.id]??[]),grant.source])];
  known.add(grant.id);
  if(grant.prepared){
   if(Object.prototype.hasOwnProperty.call(preparationSources,grant.id)||!wasPrepared)
    preparationSources[grant.id]=[...new Set([...(preparationSources[grant.id]??[]),grant.source])];
   prepared.add(grant.id);
  }
 }
 return {ok:true,known:[...known],prepared:[...prepared],sources,preparationSources};
}
