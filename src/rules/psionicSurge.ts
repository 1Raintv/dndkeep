import {psionicDieSides} from './psionicRestoration';
export interface PsionicSurgeCharacter {
 class_name:string; level:number; secondary_class?:string|null; secondary_level?:number|null;
 hit_dice_spent?:number|null;
}
/** v2.757 — UA update p.4: one Hit Point Die raises every 1–3 in this
 * Energy Dice roll to 4. It does not spend another Energy Die or heal HP. */
export function psionicSurge(character:PsionicSurgeCharacter,rolls:readonly number[]) {
 if(character.class_name!=='Psion'||!Number.isInteger(character.level)||character.level<7||character.level>20)return null;
 const secondary=character.secondary_class?(character.secondary_level??0):0;
 if(!Number.isInteger(secondary)||secondary<0||character.level+secondary>20)return null;
 const spent=character.hit_dice_spent??0;
 if(!Number.isInteger(spent)||spent<0||spent>=character.level+secondary)return null;
 const sides=psionicDieSides(character.level);
 if(!rolls.length||rolls.some(n=>!Number.isInteger(n)||n<1||n>sides)||!rolls.some(n=>n<4))return null;
 const adjusted=rolls.map(n=>Math.max(4,n));
 return {rolls:adjusted,total:adjusted.reduce((sum,n)=>sum+n,0),hit_dice_spent:spent+1};
}
