import {CLASS_MAP} from '../data/classes';
import {resolveHitDice,type HitDie,type HitDiceClass} from '../rules/hitDice';
import type {Character} from '../types';
type HitDiceCharacter=Pick<Character,'class_name'|'level'|'secondary_class'|'secondary_level'|'hit_dice_spent'> & {hit_dice_spent_by_type?:unknown};
/** Catalog lookup belongs outside pure rules. An unknown class is not a d8. */
export function characterHitDice(character:HitDiceCharacter){
 const classes:HitDiceClass[]=[{name:character.class_name,level:character.level,die:CLASS_MAP[character.class_name]?.hit_die as HitDie}];
 if(character.secondary_class&&(character.secondary_level??0)!==0)classes.push({name:character.secondary_class,level:character.secondary_level!,die:CLASS_MAP[character.secondary_class]?.hit_die as HitDie});
 return resolveHitDice(classes,character.hit_dice_spent,character.hit_dice_spent_by_type);
}
