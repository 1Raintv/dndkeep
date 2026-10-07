import {psionicDisciplineTotal} from './psionicDisciplineRoll';
export {psionicDisciplineCapacity as biofeedbackCapacity} from './psionicDisciplineRoll';
/** UA Update p.4: temporary HP does not stack with a higher existing pool. */
export function biofeedbackResult(rolls:readonly number[],sides:number,intelligenceModifier:number,currentTempHp:number){
 const gained=psionicDisciplineTotal(rolls,sides,intelligenceModifier);
 if(gained===null||!Number.isFinite(currentTempHp)||currentTempHp<0)return null;
 return {gained,tempHp:Math.max(currentTempHp,gained)};
}
