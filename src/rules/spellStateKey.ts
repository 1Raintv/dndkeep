import {isSpellSources,type SpellSources} from './spellSources';

/** Database JSONB sorts object keys; realtime can also clone unchanged arrays.
 * Set order is not a gameplay change and must not discard a level-up draft. */
export function spellStateKey(input:{known:readonly string[];prepared:readonly string[];sources:SpellSources;preparationSources:SpellSources}):string{
 const sortedMap=(value:SpellSources)=>isSpellSources(value)?Object.fromEntries(Object.keys(value).sort().map(id=>[id,[...new Set(value[id])].sort()])):value;
 return JSON.stringify({known:[...new Set(input.known)].sort(),prepared:[...new Set(input.prepared)].sort(),sources:sortedMap(input.sources),preparationSources:sortedMap(input.preparationSources)});
}
