import type {Character} from '../types';
import {getGrantedSpellIds} from './grantedSpells';
import {getSpeciesGrantedSpellIds} from '../data/speciesChoices';

export interface SpellLevelUpTarget {kind:'primary'|'secondary'|'new';className:string;level:number;subclass:string}
/** Keep the original character's other class and total level intact when the
 * wizard targets a secondary class. A projected primary-only character loses
 * the other class's grants and gives species spells the wrong unlock level. */
export function psionSpellReplacementContext(character:Character,newLevel:number,target?:SpellLevelUpTarget){
 const selected=target??{kind:'primary',className:character.class_name,level:character.level,subclass:character.subclass??''};
 const primary=selected.kind==='primary'?{...character,level:newLevel,subclass:selected.subclass}:character;
 const secondary=selected.kind==='secondary'||selected.kind==='new'
  ?{...character,class_name:selected.className,level:newLevel,subclass:selected.subclass}
  :character.secondary_class?{...character,class_name:character.secondary_class,level:character.secondary_level??0,subclass:character.secondary_subclass??''}:null;
 const totalLevel=primary.level+(secondary?.level??0);
 const granted=[...new Set([...getGrantedSpellIds(primary).all,
  ...(secondary?getGrantedSpellIds(secondary).all:[]),
  ...getSpeciesGrantedSpellIds(character.species,character.species_choices,totalLevel)])];
 return {selected,granted};
}
