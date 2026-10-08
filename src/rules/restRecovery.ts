/** SRD 5.2.1, Rules Glossary p.185: a completed Long Rest restores all
 * spent Hit Point Dice. The half-level recovery was the older ruleset. */
export function longRestHitDice(spent:number|null|undefined){
 return {spent:0,recovered:Number.isInteger(spent)&&Number(spent)>=0?Number(spent):0};
}

/** v2.795 — 2024 Rules Glossary, Short Rest: apply CON and the 1 HP
 * minimum to each spent die. Low rolls cannot cancel healing from high rolls. */
export function shortRestHealing(rolls:readonly number[],constitutionModifier:number):number|null {
 if(!rolls.length||!Number.isInteger(constitutionModifier)||rolls.some(n=>!Number.isInteger(n)||n<1||n>12))return null;
 return rolls.reduce((total,roll)=>total+Math.max(1,roll+constitutionModifier),0);
}
