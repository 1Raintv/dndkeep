/** SRD 5.2.1, Rules Glossary p.185: a completed Long Rest restores all
 * spent Hit Point Dice. The half-level recovery was the older ruleset. */
export function longRestHitDice(spent:number|null|undefined){
 return {spent:0,recovered:Number.isInteger(spent)&&Number(spent)>=0?Number(spent):0};
}
