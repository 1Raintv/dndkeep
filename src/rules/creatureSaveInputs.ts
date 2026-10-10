const abilities:Record<string,string>={str:'strength',dex:'dexterity',con:'constitution',int:'intelligence',wis:'wisdom',cha:'charisma'};
/** v2.869: an absent proficiency list/CR is not proof of a +0/+2 bonus.
 * Validate the stored homebrew shape before the caller uses canonical modifier
 * and CR-to-PB math. Unsupported homebrew values remain a manual decision.
 * 2024 Basic Rules, Playing the Game: creature ability scores range 1–30. */
export function creatureSaveInputs(ability:string,scores:unknown,proficiencies:unknown,cr:unknown):{score:number;proficient:boolean;cr:number|null}|null {
 const key=ability.toLowerCase();if(!Object.prototype.hasOwnProperty.call(abilities,key)||!scores||typeof scores!=='object'||Array.isArray(scores)||!Array.isArray(proficiencies))return null;
 const score=(scores as Record<string,unknown>)[key];
 if(typeof score!=='number'||!Number.isInteger(score)||score<1||score>30)return null;
 const normalized:string[]=[];
 for(const value of proficiencies){
  if(typeof value!=='string')return null;const name=value.trim().toLowerCase();
  const found=Object.keys(abilities).find(k=>k===name||abilities[k]===name);if(!found)return null;normalized.push(found);
 }
 const proficient=normalized.includes(key);if(!proficient)return {score,proficient:false,cr:null};
 let rating:unknown=cr;
 if(typeof cr==='string'){
  const value=cr.trim(),fractions:Record<string,number>={'1/8':.125,'1/4':.25,'1/2':.5};
  rating=fractions[value]??(/^\d+$/.test(value)?Number(value):null);
 }
 if(typeof rating!=='number'||!Number.isFinite(rating)||rating<0||rating>30||(!Number.isInteger(rating)&&![.125,.25,.5].includes(rating)))return null;
 return {score,proficient:true,cr:rating};
}
