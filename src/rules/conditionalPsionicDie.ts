import {psionicDieCount,psionicDieSides} from './psionicRestoration';
/** v2.756 — UA update pp.4–5: the die must be available to roll; expenditure
 * happens only if its bonus turns the attack/check into a success. */
export function conditionalPsionicDie(level:number,pool:unknown,roll:number,changedOutcome:boolean) {
 const maximum=psionicDieCount(level);
 const sides=psionicDieSides(level);
 const remaining=pool===undefined?maximum:typeof pool==='number'&&Number.isInteger(pool)&&pool>=0?pool:0;
 if(level<2||remaining<1||!Number.isInteger(roll)||roll<1||roll>sides)return null;
 const cost=changedOutcome?1:0;
 return {cost,remaining:remaining-cost,sides};
}
