import {psionicPoolRemaining,psionicDieSides} from './psionicRestoration';
/** UA Update p.4: Biofeedback and Destructive Thoughts share this expenditure. */
export function psionicDisciplineCapacity(level:number,pool:unknown,intelligenceModifier:number){
 const remaining=psionicPoolRemaining(level,pool);
 if(level<2||remaining===null||!Number.isInteger(intelligenceModifier))return null;
 return {remaining,sides:psionicDieSides(level),maxDice:Math.max(0,Math.min(remaining,intelligenceModifier))};
}
export function psionicDisciplineTotal(rolls:readonly number[],sides:number,intelligenceModifier:number):number|null {
 if(!rolls.length||rolls.some(n=>!Number.isInteger(n)||n<1||n>sides)||!Number.isInteger(intelligenceModifier))return null;
 return Math.max(1,rolls.reduce((sum,n)=>sum+n,0)+intelligenceModifier);
}
