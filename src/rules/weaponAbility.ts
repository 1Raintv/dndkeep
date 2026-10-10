/** v2.869: weapon category determines the default ability, not attack distance.
 * Throwing a melee weapon does not turn it into a Dexterity-based weapon.
 * Finesse permits either ability; automatic rows use the higher modifier. */
export function weaponAbilityModifier(strength:number,dexterity:number,weapon:{ranged:boolean;finesse?:boolean}):number {
 return weapon.finesse?Math.max(strength,dexterity):weapon.ranged?dexterity:strength;
}

/** Blank means unknown; never infer the ability from a total attack bonus. */
export function parseWeaponAbilityModifier(text:string):{valid:true;value:number|undefined}|{valid:false}{
 const value=text.trim();if(!value)return {valid:true,value:undefined};
 if(!/^[+-]?\d+$/.test(value))return {valid:false};
 const number=Number(value);
 return Number.isSafeInteger(number)&&number>=-2147483648&&number<=2147483647?{valid:true,value:number}:{valid:false};
}
