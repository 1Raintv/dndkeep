import type {Character} from '../types';
import {getGrantedSpellIds} from './grantedSpells';
import {getSpeciesGrantedSpellIds} from '../data/speciesChoices';
import {SPELL_MAP} from '../data/spells';
import {reconcileSpellGrants,type AutomaticSpellGrant} from '../rules/reconcileSpellGrants';

/** Both classes use their own level; species unlocks use total character level. */
export function getAutomaticSpellGrants(character:Character):AutomaticSpellGrant[]{
 // v2.788: stale/invalid secondary levels must not unlock class or species grants.
 const secondaryLevel=character.secondary_class&&Number.isInteger(character.secondary_level)&&(character.secondary_level??0)>0?character.secondary_level!:0;
 const classes=[character,...(secondaryLevel>0?[{...character,class_name:character.secondary_class!,level:secondaryLevel,subclass:character.secondary_subclass}]:[])];
 const grants:AutomaticSpellGrant[]=classes.flatMap(part=>getGrantedSpellIds(part).all.map(id=>({id,source:`grant:class:${part.class_name}` as const,prepared:(SPELL_MAP[id]?.level??0)>0})));
 const total=character.level+secondaryLevel;
 for(const id of getSpeciesGrantedSpellIds(character.species,character.species_choices,total))grants.push({id,source:'grant:species',prepared:(SPELL_MAP[id]?.level??0)>0});
 return grants;
}

/** Minimal patch prevents a grant effect from creating a repeated save loop.
 * Malformed metadata is left untouched for recovery rather than guessed over. */
export function automaticSpellGrantPatch(character:Character):Partial<Character>{
 const result=reconcileSpellGrants({known:character.known_spells,prepared:character.prepared_spells,sources:character.spell_sources??{},preparationSources:character.spell_preparation_sources??{},grants:getAutomaticSpellGrants(character)});
 if(!result.ok)return {};
 const desired:Partial<Character>={known_spells:result.known,prepared_spells:result.prepared,spell_sources:result.sources,spell_preparation_sources:result.preparationSources};
 return Object.fromEntries(Object.entries(desired).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(character[key as keyof Character]??(key.endsWith('sources')?{}:[]))));
}
