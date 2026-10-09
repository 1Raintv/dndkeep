import {supabase} from '../supabase';
import {rollDie,rollDiceGroups} from '../../rules/dice';
import type {PendingAttack} from '../../types';
export const ATTACK_SAVE_CHANGED='dndkeep:attack-save-changed';
export interface AttackSaveContext {
 attack:{id:string;state:string;kind:string;ability:string;dc:number;result:string|null};
 target:unknown;conditions:string[];buffs:Array<{key:string;name?:string;source?:string;saveBonus?:string}>;
 exhaustion:number;naturalExtremes:boolean;autoFail:boolean;advantage:boolean;disadvantage:boolean;
}
interface BuffRoll {key:string;name:string;source?:string;dice:string;rolls:number[];total:number}
export interface SavedAttackSave {version:1;attackId:string;context:AttackSaveContext;pool:number[];dice:number[];baseBonus:number;buffPool:BuffRoll[];buffContributions:BuffRoll[];buffTotal:number;penaltyD4:number|null;penaltyPool:number|null}
const active=new Map<string,Promise<PendingAttack>>();
const key=(id:string)=>`dndkeep:attack-save:${id}`;
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
function verifyContext(value:unknown,id:string):asserts value is AttackSaveContext {
 const c=value as AttackSaveContext|null;
 if(!c||c.attack?.id!==id||c.attack.kind!=='save'||c.attack.state!=='declared'||c.attack.result!==null
  ||!['STR','DEX','CON','INT','WIS','CHA'].includes(c.attack.ability)||!Number.isSafeInteger(c.attack.dc)
  ||!Array.isArray(c.conditions)||!c.conditions.every(v=>typeof v==='string')||!Array.isArray(c.buffs)
  ||!c.buffs.every(b=>b&&typeof b.key==='string'&&(b.saveBonus===undefined||typeof b.saveBonus==='string'))
  ||!integer(c.exhaustion,0,6)||![c.naturalExtremes,c.autoFail,c.advantage,c.disadvantage].every(v=>typeof v==='boolean'))
  throw new Error('Saving throw settings could not be verified. Refresh combat.');
}
function verifySaved(v:unknown,id:string):asserts v is SavedAttackSave {
 const r=v as SavedAttackSave|null;
 if(!r||r.version!==1||r.attackId!==id)throw new Error('The saved throw is unreadable. No new dice were sent.');
 verifyContext(r.context,id);
 const count=r.context.autoFail?0:r.context.advantage!==r.context.disadvantage?2:1;
 if(!Array.isArray(r.pool)||r.pool.length>2||!r.pool.every(d=>integer(d,1,20))||!Array.isArray(r.dice)||r.dice.length!==count
  ||!r.dice.every((d,i)=>d===r.pool[i])||!integer(r.baseBonus,-10000,10000)||!integer(r.buffTotal,-10000,10000)
  ||!Array.isArray(r.buffPool)||!Array.isArray(r.buffContributions)
  ||![...r.buffPool,...r.buffContributions].every(b=>b&&typeof b.key==='string'&&typeof b.dice==='string'&&typeof b.name==='string'&&Number.isSafeInteger(b.total)&&Array.isArray(b.rolls)&&b.rolls.every(d=>integer(d,1,1000)))
  ||r.buffContributions.reduce((sum,b)=>sum+b.total,0)!==r.buffTotal
  ||(r.penaltyPool!==null&&!integer(r.penaltyPool,1,4))||(r.context.autoFail?r.penaltyD4!==null:!integer(r.penaltyD4,1,4)||r.penaltyD4!==r.penaltyPool))throw new Error('The saved throw is unreadable. No new dice were sent.');
}
export function savedAttackSave(id:string):SavedAttackSave|null {
 const raw=localStorage.getItem(key(id));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('The saved throw is unreadable. No new dice were sent.');}
 verifySaved(value,id);return value;
}
function store(r:SavedAttackSave){verifySaved(r,r.attackId);localStorage.setItem(key(r.attackId),JSON.stringify(r));window.dispatchEvent(new Event(ATTACK_SAVE_CHANGED));}
async function context(id:string):Promise<AttackSaveContext>{
 const {data,error}=await (supabase as any).rpc('get_pending_attack_save_context',{p_attack:id});
 if(error)throw new Error(error.message??'Saving throw settings could not be loaded.');verifyContext(data,id);return data;
}
function prepare(id:string,c:AttackSaveContext,baseBonus:number,prior:SavedAttackSave|null):SavedAttackSave{
 if(!integer(baseBonus,-10000,10000))throw new Error('Enter a whole-number saving throw bonus.');
 const count=c.autoFail?0:c.advantage!==c.disadvantage?2:1,pool=[...(prior?.pool??[])];
 while(pool.length<count)pool.push(rollDie(20));
 const buffPool=[...(prior?.buffPool??[])];
 const buffContributions=c.autoFail?[]:c.buffs.filter(b=>b.saveBonus).map(b=>{
  const old=buffPool.find(r=>r.key===b.key&&r.dice===b.saveBonus);if(old)return old;
  const roll=rollDiceGroups(b.saveBonus!);if(!roll)throw new Error(`Review the saving throw bonus for ${b.name??b.key}.`);
  const result={key:b.key,name:b.name??b.key,source:b.source,dice:b.saveBonus!,rolls:roll.dice.map(d=>d.value),total:roll.total};buffPool.push(result);return result;
 });
 const penaltyPool=prior?.penaltyPool??(c.autoFail?null:rollDie(4));
 return {version:1,attackId:id,context:c,pool,dice:pool.slice(0,count),baseBonus,buffPool,buffContributions,
  buffTotal:buffContributions.reduce((sum,b)=>sum+b.total,0),penaltyPool,penaltyD4:c.autoFail?null:penaltyPool};
}
/** Explicit review refreshes settings, retaining every compatible already-rolled die.
 * It only saves the proposal; the user still confirms the actual save separately. */
export async function reviewAttackSave(id:string,baseBonus:number):Promise<void>{
 if(active.has(id))throw new Error('Wait for the saving throw confirmation.');
 const prior=savedAttackSave(id);if(!prior)throw new Error('There is no saved throw to review.');
 const c=await context(id);if(active.has(id))throw new Error('Wait for the saving throw confirmation.');store(prepare(id,c,baseBonus,prior));
}
function verifyReceipt(value:unknown,id:string,request:SavedAttackSave):PendingAttack{
 const r=value as {attack?:PendingAttack;dice?:number[];penalty?:{saveId:string;saveKind:string;penalty:number;die:number|null;consumedIds:string[];expiredIds:string[]}|null;replayed?:boolean}|null;
 const a=r?.attack;
 if(!a||a.id!==id||!['passed','failed'].includes(a.save_result??'')||!integer(a.save_d20,1,20)||!Number.isSafeInteger(a.save_total)
  ||typeof a.pending_lr_decision!=='boolean'||typeof r?.replayed!=='boolean'||!Array.isArray(r.dice)||r.dice.length>2
  ||!r.dice.every(d=>integer(d,1,20))||(r.dice.length?!r.dice.includes(a.save_d20!):a.save_d20!==1))
  throw new Error('Saving throw confirmation could not be verified. Your dice are saved; retry this throw.');
 if(r.penalty!=null){const p=r.penalty;
  if(p.saveId!==id||p.saveKind!=='attack'||!integer(p.penalty,0,4)||!Array.isArray(p.consumedIds)||!p.consumedIds.every(x=>typeof x==='string'&&!!x)
   ||!Array.isArray(p.expiredIds)||!p.expiredIds.every(x=>typeof x==='string'&&!!x)||(p.penalty>0?p.die!==p.penalty||!p.consumedIds.length:p.die!==null))
   throw new Error('Saving throw penalty could not be verified. Your dice are saved; retry this throw.');
 }
 if(!r.replayed){
  const c=request.context,cover=c.attack.ability==='DEX'?((c.attack as AttackSaveContext['attack']&{cover?:string}).cover==='half'?2:(c.attack as AttackSaveContext['attack']&{cover?:string}).cover==='three_quarters'?5:0):0;
  const chosen=c.autoFail?1:c.advantage&&!c.disadvantage?Math.max(...request.dice):c.disadvantage&&!c.advantage?Math.min(...request.dice):request.dice[0];
  if(JSON.stringify(r.dice)!==JSON.stringify(request.dice)||a.save_d20!==chosen||a.save_total!==chosen+request.baseBonus+request.buffTotal+cover-2*c.exhaustion-(r.penalty?.penalty??0)
   ||((r.penalty?.penalty??0)>0&&r.penalty?.die!==request.penaltyD4))throw new Error('Saved result differs from the proposed dice. Keep the saved throw and retry.');
 }
 return {...a,save_penalty:r.penalty??null};
}
async function settle(id:string,baseBonus:number):Promise<PendingAttack>{
 let request=savedAttackSave(id);
 if(!request){request=prepare(id,await context(id),baseBonus,null);store(request);}
 if(request.baseBonus!==baseBonus)throw new Error(`Saved dice use bonus ${request.baseBonus}. Review changed settings before confirming a different bonus.`);
 const {data,error}=await (supabase as any).rpc('settle_pending_attack_save',{p_attack:id,p_expected:request.context,p_dice:request.dice,p_base_bonus:request.baseBonus,p_buff_total:request.buffTotal,p_buff_contributions:request.buffContributions,p_penalty_d4:request.penaltyD4});
 if(error)throw new Error(error.message??'Saving throw not confirmed. Your dice are saved; retry this throw.');
 const result=verifyReceipt(data,id,request);
 forgetAttackSave(id);return result;
}
export function resolveAttackSave(id:string,baseBonus:number):Promise<PendingAttack>{
 const existing=active.get(id);if(existing)return existing;
 const request=settle(id,baseBonus).finally(()=>active.delete(id));active.set(id,request);return request;
}

/** A verified server read also settles recovery after a lost response/reload. */
export function forgetAttackSave(id:string){
 try{localStorage.removeItem(key(id));window.dispatchEvent(new Event(ATTACK_SAVE_CHANGED));}catch{/* a leftover proposal safely replays */}
}
