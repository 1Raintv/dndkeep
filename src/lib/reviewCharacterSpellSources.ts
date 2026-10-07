import type { Character } from '../types';
import { isSpellSources, type SpellSource } from '../rules/spellSources';
import { reviewSpellPreparation } from '../rules/spellPreparation';
import { psionSpellReplacementContext } from './psionSpellReplacementContext';
import { canPrepareSpell } from './spellLimits';
import { SPELL_MAP } from '../data/spells';

/** Review repairs metadata for an existing choice; it never adds a new spell.
 * Explicitly preparing a reviewed Psion copy must still pass normal rules. */
export function reviewCharacterSpellSources(character:Character,id:string,owners:readonly SpellSource[],ready:readonly SpellSource[]):
 {ok:true;patch:Partial<Character>}|{ok:false;reason:string} {
 if(!character.known_spells.includes(id)||!SPELL_MAP[id])return {ok:false,reason:'Choose an existing learned spell to review.'};
 if(psionSpellReplacementContext(character,character.level).granted.includes(id))return {ok:false,reason:'Automatically granted spells keep their sources.'};
 if(!owners.length||!isSpellSources({[id]:owners}))return {ok:false,reason:'Choose at least one learned source.'};
 const allowed=new Set<SpellSource>([`class:${character.class_name}`,...(character.secondary_class?[`class:${character.secondary_class}` as SpellSource]:[]),'feat','species','other']);
 if(owners.some(source=>!allowed.has(source)))return {ok:false,reason:'Choose one of this character’s classes or features.'};
 if(!isSpellSources(character.spell_sources??{}))return {ok:false,reason:'Spell sources could not be read.'};
 if(SPELL_MAP[id].level===0&&ready.length)return {ok:false,reason:'Cantrips do not need preparing.'};
 const sources={...character.spell_sources,[id]:[...new Set(owners)]};
 const result=reviewSpellPreparation({id,readySources:ready,sources,prepared:character.prepared_spells,preparationSources:character.spell_preparation_sources??{}});
 if(!result.ok)return result;
 if(ready.includes('class:Psion')){
  const psion=character.class_name==='Psion'?character:{...character,class_name:'Psion',level:character.secondary_level??0,subclass:character.secondary_subclass};
  const check=canPrepareSpell({...psion,spell_sources:sources,prepared_spells:character.prepared_spells.filter(spell=>spell!==id),spell_preparation_sources:{...character.spell_preparation_sources,[id]:[]}},id);
  if(!check.allowed)return {ok:false,reason:check.reason??'Cannot prepare this Psion spell.'};
 }
 return {ok:true,patch:{spell_sources:sources,prepared_spells:result.prepared,spell_preparation_sources:result.preparationSources}};
}
