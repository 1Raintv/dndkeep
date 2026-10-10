import {abilityModifier} from './abilities';
import {crToProficiencyBonus} from './proficiency';
import {creatureSaveInputs} from './creatureSaveInputs';
import {catalogSaveBonus} from './catalogSaveBonus';
export interface CreatureSaveStats {
 saving_throws?:unknown;ability_scores?:unknown;save_proficiencies?:unknown;cr?:unknown;
 str?:unknown;dex?:unknown;con?:unknown;int?:unknown;wis?:unknown;cha?:unknown;
}
/** v2.869: one calculation for display and automation. NULL totals retain
 * homebrew proficiency semantics; neither path invents missing source data. */
export function creatureSaveBonus(ability:string,row:CreatureSaveStats|null):{bonus:number;breakdown:string}|null {
 if(!row)return null;
 if(row.saving_throws!=null){
  const bonus=catalogSaveBonus(ability,{...row});
  return bonus===null?null:{bonus,breakdown:`${bonus>=0?'+':''}${bonus} (${ability}, stat block)`};
 }
 const inputs=creatureSaveInputs(ability,row.ability_scores,row.save_proficiencies,row.cr);if(!inputs)return null;
 const mod=abilityModifier(inputs.score),pb=inputs.proficient?crToProficiencyBonus(inputs.cr):0,bonus=mod+pb;
 return {bonus,breakdown:inputs.proficient?`${mod>=0?'+':''}${mod} (${ability}) + ${pb} (prof) = ${bonus>=0?'+':''}${bonus}`:`${mod>=0?'+':''}${mod} (${ability}, creature)`};
}
