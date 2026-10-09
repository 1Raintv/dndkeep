import {rollDiceGroups} from './dice';
export interface DeathSaveBonusRoll {name:string;expression:string;total:number;dice:{die:number;value:number}[];modifier:number}
/** Combat buff save bonuses are independent of ability scores. Keep the actual
 * dice evidence so an automatic save can be resumed without rolling again. */
export function rollDeathSaveBonuses(buffs:unknown[],equipmentBonus:number):{bonus:number;rolls:DeathSaveBonusRoll[]} {
 if(!Number.isSafeInteger(equipmentBonus))throw new Error('Review equipment save bonuses.');
 const rolls:DeathSaveBonusRoll[]=[];
 for(const value of buffs){
  if(!value||typeof value!=='object')throw new Error('Review active saving throw effects.');
  const buff=value as {name?:unknown;saveBonus?:unknown};if(buff.saveBonus===undefined||buff.saveBonus==='')continue;
  const expression=String(buff.saveBonus),name=typeof buff.name==='string'?buff.name:'Saving throw effect';
  const roll=typeof buff.saveBonus==='number'&&Number.isSafeInteger(buff.saveBonus)?{total:buff.saveBonus,dice:[],modifier:buff.saveBonus}:typeof buff.saveBonus==='string'?rollDiceGroups(buff.saveBonus):null;
  if(!roll)throw new Error(`Review ${name}: its save bonus cannot be rolled automatically.`);
  rolls.push({name,expression,...roll});
 }
 const bonus=rolls.reduce((sum,r)=>sum+r.total,equipmentBonus);
 if(!Number.isSafeInteger(bonus)||bonus< -100||bonus>100)throw new Error('Review the combined save modifier.');
 return {bonus,rolls};
}
