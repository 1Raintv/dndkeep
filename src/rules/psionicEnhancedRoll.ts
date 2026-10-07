import {psionicDieSides} from './psionicRestoration';
export interface PsionicRollEnhancement {originalRoll?:number;surged?:boolean;enkindledRolls?:readonly number[]}
/** Validate a settled bonus/distance total against its original dice, not the
 * single-die maximum. Hit Point Dice were paid when those extra dice rolled. */
export function validPsionicRoll(level:number,total:number,enhancement:PsionicRollEnhancement={}){
 if(!Number.isInteger(level)||level<1||level>20||!Number.isInteger(total)||total<1)return false;
 const sides=psionicDieSides(level),extra=enhancement.enkindledRolls??[];
 if(extra.length>2||(extra.length>0&&level!==20))return false;
 if(enhancement.surged&&level<7)return false;
 if(!extra.length&&!enhancement.surged)return total<=sides;
 const originals=[enhancement.originalRoll,...extra];
 if(originals.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<1||n>sides))return false;
 return originals.reduce<number>((sum,n)=>sum+(enhancement.surged?Math.max(4,n!):n!),0)===total;
}
export function psionicRollNote(total:number,e:PsionicRollEnhancement){
 if(e.enkindledRolls?.length)return `Enkindled Life Force: ${e.enkindledRolls.length} Hit Point Dice spent for extra rolls ${e.enkindledRolls.join(', ')} (no extra Energy Dice spent).${e.surged?' Psionic Surge: low rolls treated as 4; 1 more Hit Point Die spent.':''} Dice total ${total}.`;
 return e.surged?`Psionic Surge: ${e.originalRoll} treated as ${total}; 1 Hit Point Die already spent.`:'';
}
