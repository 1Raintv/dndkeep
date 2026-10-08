import {psionProgression,type PsionicClassState} from './psionProgression';
import {psionicDieSides} from './psionicRestoration';
export interface PsionicSurgeCharacter extends PsionicClassState {
 hit_dice_spent?:number|null;
}
/** v2.757 — UA update p.4: one Hit Point Die raises every 1–3 in this
 * Energy Dice roll to 4. It does not spend another Energy Die or heal HP. */
export function psionicSurge(character:PsionicSurgeCharacter,rolls:readonly number[]) {
 const progression=psionProgression(character);
 if(!progression||progression.level<7)return null;
 const spent=character.hit_dice_spent??0;
 if(!Number.isInteger(spent)||spent<0||spent>=progression.totalLevel)return null;
 const sides=psionicDieSides(progression.level);
 if(!rolls.length||rolls.some(n=>!Number.isInteger(n)||n<1||n>sides)||!rolls.some(n=>n<4))return null;
 const adjusted=rolls.map(n=>Math.max(4,n));
 return {rolls:adjusted,total:adjusted.reduce((sum,n)=>sum+n,0),hit_dice_spent:spent+1};
}
