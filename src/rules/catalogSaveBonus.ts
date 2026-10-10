import {abilityModifier} from './abilities';
const abilities:Record<string,string>={str:'strength',dex:'dexterity',con:'constitution',int:'intelligence',wis:'wisdom',cha:'charisma'};
/** v2.869: catalog saving throws are final modifiers, not proficiency flags.
 * A missing map is unknown; an explicitly empty map permits the ability modifier. */
export function catalogSaveBonus(ability:string,row:Record<string,unknown>):number|null {
 const key=ability.trim().toLowerCase();if(!Object.prototype.hasOwnProperty.call(abilities,key))return null;
 const raw=row.saving_throws;if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const saves=new Map<string,number>();
 for(const [name,value] of Object.entries(raw)){
  const alias=name.trim().toLowerCase(),normalized=Object.keys(abilities).find(k=>k===alias||abilities[k]===alias);
  if(!normalized||typeof value!=='number'||!Number.isSafeInteger(value)||value < -1000||value > 1000)return null;
  if(saves.has(normalized)&&saves.get(normalized)!==value)return null;
  saves.set(normalized,value);
 }
 if(saves.has(key))return saves.get(key)!;
 const score=row[key];return typeof score==='number'&&Number.isInteger(score)&&score>=1&&score<=30?abilityModifier(score):null;
}
