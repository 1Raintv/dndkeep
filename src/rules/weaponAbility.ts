/** v2.869: weapon category determines the default ability, not attack distance.
 * Throwing a melee weapon does not turn it into a Dexterity-based weapon.
 * Finesse permits either ability; automatic rows use the higher modifier. */
export function weaponAbilityModifier(strength:number,dexterity:number,weapon:{ranged:boolean;finesse?:boolean}):number {
 return weapon.finesse?Math.max(strength,dexterity):weapon.ranged?dexterity:strength;
}
