import {rollDiceGroups,validDiceGroups} from './dice';
export interface SaveBonusRoll {name:string;expression:string;total:number;dice:{die:number;value:number}[];modifier:number;multiplier?:-1}
/** Combat buff save bonuses are independent of ability scores. Keep the actual
 * dice evidence so an automatic save can be resumed without rolling again. */
export function rollSaveBonuses(buffs:unknown[],equipmentBonus:number):{bonus:number;rolls:SaveBonusRoll[]} {
 if(!Number.isSafeInteger(equipmentBonus))throw new Error('Review equipment save bonuses.');
 const rolls:SaveBonusRoll[]=[];const seen=new Set<string>();
 for(const value of buffs){
  if(!value||typeof value!=='object')throw new Error('Review active saving throw effects.');
  const buff=value as {name?:unknown;saveBonus?:unknown};
  const name=typeof buff.name==='string'?buff.name:'Saving throw effect',spell=name.trim().toLowerCase();
  // The sheet's older Bless/Bane presets store a name and zero/no saveBonus.
  // Each named spell contributes once, including when combat metadata is explicit.
  const named=spell==='bless'||spell==='bane';if(named&&seen.has(spell))continue;if(named)seen.add(spell);
  const valueToRoll=named?(spell==='bless'?'1d4':'-1d4'):buff.saveBonus;
  if(valueToRoll===undefined||valueToRoll==='')continue;
  const expression=String(valueToRoll),negativeDice=typeof valueToRoll==='string'&&/^-\d+d\d+$/i.test(valueToRoll.trim());
  const numeric=typeof valueToRoll==='number'?valueToRoll:typeof valueToRoll==='string'&&/^-?\d+$/.test(valueToRoll.trim())?Number(valueToRoll):null;
  const roll=numeric!==null&&Number.isSafeInteger(numeric)?{total:numeric,dice:[],modifier:numeric}:typeof valueToRoll==='string'?rollDiceGroups(negativeDice?valueToRoll.trim().slice(1):valueToRoll):null;
  if(!roll)throw new Error(`Review ${name}: its save bonus cannot be rolled automatically.`);
  rolls.push({name,expression,...roll,...(negativeDice?{total:-roll.total,multiplier:-1 as const}:{})});
 }
 const bonus=rolls.reduce((sum,r)=>sum+r.total,equipmentBonus);
 if(!Number.isSafeInteger(bonus)||bonus< -100||bonus>100)throw new Error('Review the combined save modifier.');
 return {bonus,rolls};
}

/** v2.869 — matching totals alone do not prove the recorded dice were legal. */
export function validSaveBonusRolls(value:unknown):value is SaveBonusRoll[]{
 return Array.isArray(value)&&value.every(r=>{
  if(!r||typeof r.name!=='string'||typeof r.expression!=='string'||!Number.isSafeInteger(r.total)||!Number.isSafeInteger(r.modifier)
   ||(r.multiplier!==undefined&&r.multiplier!==-1)||!Array.isArray(r.dice))return false;
  const expression=r.expression.trim();
  if(/^-?\d+$/.test(expression))return r.multiplier===undefined&&r.dice.length===0&&r.modifier===Number(expression)&&r.total===r.modifier;
  const negative=/^-\d+d\d+$/i.test(expression);
  if(negative?(r.multiplier!==-1):(r.multiplier!==undefined))return false;
  return validDiceGroups(negative?expression.slice(1):expression,{...r,total:negative?-r.total:r.total});
 });
}
