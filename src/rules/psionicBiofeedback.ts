import {psionicPoolRemaining,psionicDieSides} from './psionicRestoration';
/** UA Update p.4: expend up to INT modifier dice; temporary HP = sum + INT. */
export function biofeedbackCapacity(level:number,pool:unknown,intelligenceModifier:number){
 const remaining=psionicPoolRemaining(level,pool);
 if(level<2||remaining===null||!Number.isInteger(intelligenceModifier))return null;
 return {remaining,sides:psionicDieSides(level),maxDice:Math.max(0,Math.min(remaining,intelligenceModifier))};
}
export function biofeedbackResult(rolls:readonly number[],sides:number,intelligenceModifier:number,currentTempHp:number){
 if(!rolls.length||rolls.some(n=>!Number.isInteger(n)||n<1||n>sides)||!Number.isInteger(intelligenceModifier)||!Number.isFinite(currentTempHp)||currentTempHp<0)return null;
 const gained=Math.max(1,rolls.reduce((sum,n)=>sum+n,0)+intelligenceModifier);
 return {gained,tempHp:Math.max(currentTempHp,gained)};
}
