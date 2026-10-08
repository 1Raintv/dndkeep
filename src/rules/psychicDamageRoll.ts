import {readDamageComponents} from './damageComponents';
import {readPsionicDamageDice} from './psionicDamageDice';
export interface PsychicDamageAttack {spell_cast_source?:string|null;attack_kind?:string;attack_source?:string|null;attack_name?:string;damage_type?:string|null;damage_dice?:string|null;damage_group_id?:string|null;damage_components?:unknown;psionic_damage_dice?:unknown;save_result?:string|null;save_success_effect?:string|null}
/** v2.867: display/routing only. The server verifies the paid casting receipt,
 * source and saved dice before permitting spell settlement. Mixed damage and
 * shared rolls need their own complete resolution, never a guessed psychic total. */
export function psychicDamageRoll(a:PsychicDamageAttack):{rolls:number[];modifier:number;expression:string;originalRolls:number[]}|null {
 const psion=readPsionicDamageDice(a.psionic_damage_dice);
 if(psion)return {rolls:psion.rolls,originalRolls:psion.originalRolls,modifier:psion.modifier,expression:`${psion.rolls.length}d${psion.sides}+${psion.modifier}`};
 if(!a.spell_cast_source||a.attack_kind!=='save'||a.attack_source!=='spell'||a.damage_group_id||a.psionic_damage_dice!=null||a.damage_type?.toLowerCase()!=='psychic'
  ||!['passed','failed'].includes(a.save_result??'')||!['half','none'].includes(a.save_success_effect??''))return null;
 const record=readDamageComponents(a.damage_components),base=record?.components[0];
 if(record?.components.length!==1||!base||base.source!=='base'||base.damageType!=='psychic'||base.expression!==a.damage_dice||!base.rolls.length||base.dieKinds.some(k=>k!=='rolled'))return null;
 return {rolls:base.rolls,originalRolls:[...base.rolls],modifier:base.modifier,expression:base.expression};
}
