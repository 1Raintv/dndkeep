/** SRD 5.2.1, Unarmed Strike: the target chooses STR or DEX. This is
 * the base Strength DC; Athletics proficiency/expertise never changes it. */
export function unarmedSaveDC(strengthModifier:number,proficiencyBonus:number):number {
 if(!Number.isInteger(strengthModifier)||strengthModifier< -5||strengthModifier>20
  ||!Number.isInteger(proficiencyBonus)||proficiencyBonus<2||proficiencyBonus>6)throw new Error('Review unarmed ability scores and proficiency.');
 return 8+strengthModifier+proficiencyBonus;
}
export type UnarmedSaveMode='grapple'|'push'|'prone';
export function unarmedSaveRequest(mode:UnarmedSaveMode,dc:number):{name:string;notes:string}{
 if(!Number.isInteger(dc)||dc<1||dc>40)throw new Error('Review the Unarmed Strike save DC.');
 const name=mode==='grapple'?'Grapple':mode==='push'?'Shove — Push 5 ft':'Shove — Knock Prone';
 const effect=mode==='grapple'?'the target has the Grappled condition':mode==='push'?'push the target 5 feet away from you':'the target has the Prone condition';
 return {name,notes:`Target chooses a Strength or Dexterity saving throw against DC ${dc}. On a failed save, ${effect}. Target must be within 5 feet and no more than one size larger than you.${mode==='grapple'?' You need a free hand to grab it.':''} Save requested only; no save result, condition or movement has been applied.`};
}
