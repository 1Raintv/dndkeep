import {rollDie} from './dice';

export interface RechargeAction {name:string;usage?:string|null;desc?:string|null}
export type RechargeRule = {kind:'none'}|{kind:'manual';reason:string}|{kind:'roll';min:number;max:number};
export interface RechargeRoll {name:string;min:number;max:number;roll:number;recharged:boolean}
export interface RechargePlan {remaining:string[];rolls:RechargeRoll[]}

/** v2.869: a generic "recharge on roll" flag does not mean Recharge 5–6.
 * Read only the action title/usage label; prose can describe another ability.
 * Missing or conflicting ranges require review, never an invented threshold.
 * 2024 Basic Rules: How to Use a Monster / Limited Usage. */
export function monsterRechargeRule(action:RechargeAction):RechargeRule {
 const labels=[action.name,action.usage??''];
 const values:Array<{min:number;max:number}>=[];
 for(const label of labels){
  for(const match of label.matchAll(/\brecharge\s+([^)]*)/gi)){
   const text=match[1].trim();
   if(/^on roll$/i.test(text)||/^after\b/i.test(text))continue;
   const range=/^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(text);
   if(!range)return {kind:'manual',reason:'Recharge range is incomplete or malformed.'};
   const min=Number(range[1]),max=Number(range[2]??range[1]);
   if(min<1||max>6||min>max)return {kind:'manual',reason:'Recharge range must fit one d6.'};
   values.push({min,max});
  }
 }
 if(values.length){
  if(action.usage&&action.usage.trim().toLowerCase()!=='recharge on roll'&&!/^recharge\s+\d+(?:\s*[-–—]\s*\d+)?$/i.test(action.usage.trim()))
   return {kind:'manual',reason:'Recharge label conflicts with the usage rule.'};
  const first=values[0];
  if(values.some(v=>v.min!==first.min||v.max!==first.max))return {kind:'manual',reason:'Recharge labels disagree.'};
  return {kind:'roll',...first};
 }
 if(labels.some(v=>/\brecharge\b/i.test(v)&&!/recharge(?:s)? after/i.test(v)))
  return {kind:'manual',reason:'Recharge die results are missing.'};
 return {kind:'none'};
}

/** Validate the entire batch before rolling. The caller must persist this plan
 * before submitting it to the turn transaction; retrying must reuse the plan.
 * This function neither spends an action nor writes any character resources. */
export function planMonsterRecharges(expended:readonly string[],actions:readonly RechargeAction[],roll:()=>number=()=>rollDie(6)):RechargePlan {
 if(expended.some(n=>typeof n!=='string'||!n.trim())||new Set(expended).size!==expended.length)
  throw new Error('Review duplicate or missing expended recharge names.');
 const pending=expended.map(name=>{
  const matches=actions.filter(a=>a.name===name);
  if(matches.length!==1)throw new Error(`Recharge action "${name}" is missing or ambiguous.`);
  const rule=monsterRechargeRule(matches[0]);
  if(rule.kind!=='roll')throw new Error(`Review recharge for "${name}": ${rule.kind==='manual'?rule.reason:'No recharge die rule is listed.'}`);
  return {name,min:rule.min,max:rule.max};
 });
 const rolls=pending.map(rule=>{
  const value=roll();
  if(!Number.isInteger(value)||value<1||value>6)throw new Error('Recharge requires a d6 result from 1 to 6.');
  return {...rule,roll:value,recharged:value>=rule.min&&value<=rule.max};
 });
 return {remaining:rolls.filter(r=>!r.recharged).map(r=>r.name),rolls};
}
