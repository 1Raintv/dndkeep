/** v2.846: one allowance calculation for move validation and the map preview.
 * Flat reductions precede halving; Dash adds the resulting current Speed.
 * The caller supplies condition flags so the domain layer stays data-table free. */
export function combatMovementAllowance(input:{baseSpeed:number;immobilized:boolean;halved:boolean;exhaustionLevel:number;masterySlowed:boolean;dashed:boolean;telekineticBoost?:boolean;mutableForm?:boolean}):number {
 if(input.immobilized||!Number.isFinite(input.baseSpeed)||input.baseSpeed<0||!Number.isInteger(input.exhaustionLevel)||input.exhaustionLevel<0||input.exhaustionLevel>=6)return 0;
 const reduced=Math.max(0,input.baseSpeed+(input.mutableForm===true?5:0)+(input.telekineticBoost===true?10:0)-5*input.exhaustionLevel-(input.masterySlowed?10:0));
 const speed=input.halved?Math.floor(reduced/2):reduced;
 return input.dashed?speed*2:speed;
}
