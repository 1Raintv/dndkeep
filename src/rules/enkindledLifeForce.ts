/** v2.780 — owner UA Update p.4: level 20, one or two Hit Point Dice
 * buy that many additional Energy Dice; the Energy Dice are not expended. */
export function enkindledCapacity(c:{class_name:string;level:number;secondary_class?:string|null;secondary_level?:number|null;hit_dice_spent?:number|null}) {
 if(c.class_name!=='Psion'||c.level!==20||(c.secondary_class&&(c.secondary_level??0)!==0))return 0;
 const spent=c.hit_dice_spent??0;
 return Number.isInteger(spent)&&spent>=0&&spent<=20?Math.min(2,20-spent):0;
}
export function spendEnkindled(c:Parameters<typeof enkindledCapacity>[0],count:number){
 if(!Number.isInteger(count)||count<1||count>enkindledCapacity(c))return null;
 return {hit_dice_spent:(c.hit_dice_spent??0)+count};
}
