import type {Character} from '../types';
import {abilityModifier} from '../rules/abilities';
import {characterProficiencyBonus} from '../rules/proficiency';
import {getEffectiveAbilityScores} from './attunement';
import {characterSpellCasting} from './characterSpellCasting';

/** v2.802 — Counterspell uses the reacting character's normal spell DC. Neither
 * the interrupted spell's level nor the Counterspell slot changes that DC.
 * Reuse sheet ownership/preparation and effective item bonuses for every source. */
export function counterspellCasting(character:Character){
 const scores=getEffectiveAbilityScores({strength:character.strength,dexterity:character.dexterity,
  constitution:character.constitution,intelligence:character.intelligence,wisdom:character.wisdom,
  charisma:character.charisma},character.inventory);
 return characterSpellCasting(character,{id:'counterspell',level:3},{
  modifiers:{intelligence:abilityModifier(scores.intelligence),wisdom:abilityModifier(scores.wisdom),charisma:abilityModifier(scores.charisma)},
  proficiency_bonus:characterProficiencyBonus(character),
 });
}
export function selectedCounterspellCasting(character:Character,key?:string){
 const result=counterspellCasting(character);
 if(key)return result.options.find(option=>option.key===key)??null;
 return result.options.length===1&&!result.unresolvedSources.length?result.options[0]:null;
}
