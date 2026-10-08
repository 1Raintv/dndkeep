import {damageRollComponent,type DamageRollComponent} from './damageComponents';
/** v2.841: preserve already-paid Destructive Thoughts dice across the combat
 * queue. Original values remain separate from Surge-adjusted damage values.
 * This records provenance, not proof of a payment or spell-trigger eligibility. */
export interface PsionicDamageDice {version:1;sides:number;originalRolls:number[];rolls:number[];modifier:number}
export function readPsionicDamageDice(value:unknown):PsionicDamageDice|null {
 const r=value as PsionicDamageDice|null;
 if(!r||r.version!==1||![6,8,10,12].includes(r.sides)||!Number.isSafeInteger(r.modifier)||r.modifier<1||r.modifier>20
  ||!Array.isArray(r.originalRolls)||!r.originalRolls.length||r.originalRolls.length>14||!r.originalRolls.every(n=>Number.isInteger(n)&&n>=1&&n<=r.sides)
  ||!Array.isArray(r.rolls)||r.rolls.length!==r.originalRolls.length||!(r.rolls.every((n,i)=>n===r.originalRolls[i])||r.rolls.every((n,i)=>n===Math.max(4,r.originalRolls[i]))))return null;
 return {version:1,sides:r.sides,originalRolls:[...r.originalRolls],rolls:[...r.rolls],modifier:r.modifier};
}
export function psionicDamageComponent(value:PsionicDamageDice):DamageRollComponent {
 const r=readPsionicDamageDice(value);if(!r)throw new Error('The saved Psychic damage dice could not be verified.');
 return damageRollComponent({key:'base',source:'base',label:'Destructive Thoughts',expression:`${r.rolls.length}d${r.sides}+${r.modifier}`,damageType:'psychic',rolls:r.rolls,
  dieKinds:r.rolls.map((n,i)=>n===r.originalRolls[i]?'rolled':'adjusted'),modifier:r.modifier,rawTotal:r.rolls.reduce((a,b)=>a+b,0)+r.modifier});
}
