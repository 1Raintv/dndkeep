/** SRD 5.2.1, Multiclassing: proficiency uses total character level. */
export function proficiencyBonus(level:number):number {
 const valid=Number.isFinite(level)?Math.trunc(level):1;
 return Math.ceil(Math.max(1,Math.min(20,valid))/4)+1;
}
export function characterProficiencyBonus(character:{level:number;secondary_class?:string|null;secondary_level?:number|null}):number {
 const primary=Number.isFinite(character.level)?Math.max(1,Math.trunc(character.level)):1;
 const secondary=character.secondary_class&&Number.isInteger(character.secondary_level)&&character.secondary_level!>0?character.secondary_level!:0;
 return proficiencyBonus(primary+secondary);
}
