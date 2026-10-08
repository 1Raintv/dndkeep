export type HitDie=6|8|10|12;
export interface HitDiceClass {name:string;level:number;die:HitDie}
export interface HitDicePool {die:HitDie;total:number;spent:number;available:number}
export type HitDiceState=
 | {status:'ready';pools:HitDicePool[];total:number;spent:number}
 | {status:'review';total:number;spent:number;reason:string}
 | {status:'invalid';reason:string};
/** Transport validation; class-specific capacities are checked by resolveHitDice. */
export function isHitDiceAllocation(value:unknown,spent:number):value is Record<string,number>{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Number.isInteger(spent)&&spent>=0&&spent<=20
  &&Object.entries(value).every(([key,n])=>['6','8','10','12'].includes(key)&&Number.isInteger(n)&&n>=0&&n<=20)
  &&Object.values(value).reduce((sum,n)=>sum+n,0)===spent;
}
/** 2024 multiclass rules: pool identical dice, track different sizes separately.
 * A legacy aggregate cannot identify a partly spent mixed pool. Never guess
 * which class paid for past healing or Psionic Surge. */
export function resolveHitDice(classes:readonly HitDiceClass[],spent:number|null|undefined,byType:unknown):HitDiceState {
 if(!classes.length||classes.length>2||classes.some(c=>!c.name||!Number.isInteger(c.level)||c.level<1||![6,8,10,12].includes(c.die))||new Set(classes.map(c=>c.name)).size!==classes.length)
  return {status:'invalid',reason:'Review class levels and Hit Die sizes.'};
 const total=classes.reduce((sum,c)=>sum+c.level,0),used=spent??0;
 if(total>20||!Number.isInteger(used)||used<0||used>total)return {status:'invalid',reason:'Review the total spent Hit Dice.'};
 const capacity=new Map<HitDie,number>();for(const c of classes)capacity.set(c.die,(capacity.get(c.die)??0)+c.level);
 let counts:Record<string,number>;
 if(byType===null||byType===undefined){
  if(capacity.size>1&&used>0&&used<total)return {status:'review',total,spent:used,reason:'Choose which die sizes were spent; the saved total does not identify them.'};
  counts=Object.fromEntries([...capacity].map(([die,count])=>[die,used===0?0:capacity.size===1?used:count]));
 }else{
  if(typeof byType!=='object'||Array.isArray(byType))return {status:'invalid',reason:'Review the saved Hit Dice by size.'};
  counts=byType as Record<string,number>;
  if(Object.entries(counts).some(([key,n])=>!capacity.has(Number(key) as HitDie)||String(Number(key))!==key||!Number.isInteger(n)||n<0||n>capacity.get(Number(key) as HitDie)!)
   ||Object.values(counts).reduce((sum,n)=>sum+n,0)!==used)return {status:'invalid',reason:'Spent Hit Dice by size must match the saved total and class limits.'};
 }
 return {status:'ready',total,spent:used,pools:[...capacity].sort(([a],[b])=>a-b).map(([die,count])=>({die,total:count,spent:counts[die]??0,available:count-(counts[die]??0)}))};
}
/** Select the actual pool before any paid healing/feature request. */
export function spendHitDice(state:HitDiceState,die:HitDie,count:number):Record<string,number>|null {
 if(state.status!=='ready'||!Number.isInteger(count)||count<1)return null;
 const pool=state.pools.find(p=>p.die===die);if(!pool||pool.available<count)return null;
 return Object.fromEntries(state.pools.map(p=>[p.die,p.spent+(p.die===die?count:0)]));
}
