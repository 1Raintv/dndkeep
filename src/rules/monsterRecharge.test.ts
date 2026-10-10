import {describe,it,expect,vi} from 'vitest';
import {monsterRechargeRule,planMonsterRecharges} from './monsterRecharge';

describe('monster recharge rules',()=>{
 it.each(['5-6','5–6','5—6','5 - 6'])('recognizes an explicit range %s',range=>{
  expect(monsterRechargeRule({name:`Breath (Recharge ${range})`})).toEqual({kind:'roll',min:5,max:6});
 });
 it('recognizes a single face and an explicit usage label',()=>{
  expect(monsterRechargeRule({name:'Burst (Recharge 6)',usage:'recharge on roll'})).toEqual({kind:'roll',min:6,max:6});
  expect(monsterRechargeRule({name:'Web',usage:'Recharge 4–6'})).toEqual({kind:'roll',min:4,max:6});
 });
 it('does not invent ranges from a generic flag or unrelated prose',()=>{
  expect(monsterRechargeRule({name:'Breath',usage:'recharge on roll',desc:'Unlike Breath (Recharge 6), this action is different.'}).kind).toBe('manual');
  expect(monsterRechargeRule({name:'Bite',desc:'Can replace Breath (Recharge 5–6).'})).toEqual({kind:'none'});
 });
 it.each(['Recharge 0–6','Recharge 5–7','Recharge 6–5','Recharge 10','Recharge 5–60','Recharge 5–6.5','Recharge 5–x','Recharge 5–','Recharge 5.5'])('rejects invalid %s',label=>{
  expect(monsterRechargeRule({name:`Burst (${label})`}).kind).toBe('manual');
 });
 it('does not let a valid usage hide malformed title data',()=>{
  expect(monsterRechargeRule({name:'Burst (Recharge 5–6.5)',usage:'Recharge 6'}).kind).toBe('manual');
 });
 it('does not choose between conflicting labels',()=>{
  expect(monsterRechargeRule({name:'Burst (Recharge 6)',usage:'Recharge 5–6'}).kind).toBe('manual');
 });
 it('rejects a numbered label paired with a different recovery rule',()=>{
  expect(monsterRechargeRule({name:'Burst (Recharge 6)',usage:'1/day'}).kind).toBe('manual');
 });
 it('does not roll rest-based or daily recovery',()=>{
  expect(monsterRechargeRule({name:'Bite',usage:'1/day'})).toEqual({kind:'none'});
  expect(monsterRechargeRule({name:'Burst (Recharges after a Short or Long Rest)'})).toEqual({kind:'none'});
 });
 it('uses each listed threshold, one die per expended action, and preserves failures',()=>{
  const actions=[{name:'Breath (Recharge 5–6)'},{name:'Burst (Recharge 6)'},{name:'Web (Recharge 4–6)'}];
  const roll=vi.fn().mockReturnValueOnce(5).mockReturnValueOnce(5).mockReturnValueOnce(4);
  expect(planMonsterRecharges(actions.map(a=>a.name),actions,roll)).toEqual({remaining:['Burst (Recharge 6)'],rolls:[
   {name:actions[0].name,min:5,max:6,roll:5,recharged:true},
   {name:actions[1].name,min:6,max:6,roll:5,recharged:false},
   {name:actions[2].name,min:4,max:6,roll:4,recharged:true},
  ]});expect(roll).toHaveBeenCalledTimes(3);
 });
 it('validates the whole batch before rolling anything',()=>{
  const actions=[{name:'Breath (Recharge 5–6)'},{name:'Unknown',usage:'recharge on roll'}],roll=vi.fn(()=>6);
  expect(()=>planMonsterRecharges(actions.map(a=>a.name),actions,roll)).toThrow(/Review recharge/);expect(roll).not.toHaveBeenCalled();
 });
 it('rejects missing, ambiguous and duplicate names before rolling',()=>{
  const action={name:'Burst (Recharge 6)'},roll=vi.fn(()=>6);
  expect(()=>planMonsterRecharges(['Missing'],[action],roll)).toThrow(/missing or ambiguous/);
  expect(()=>planMonsterRecharges([action.name],[action,action],roll)).toThrow(/missing or ambiguous/);
  expect(()=>planMonsterRecharges([action.name,action.name],[action],roll)).toThrow(/duplicate/);
  expect(roll).not.toHaveBeenCalled();
 });
 it.each([0,7,2.5,NaN])('rejects non-d6 result %s',value=>{
  const action={name:'Burst (Recharge 6)'};expect(()=>planMonsterRecharges([action.name],[action],()=>value)).toThrow(/d6 result/);
 });
 it('does not roll for available actions or mutate its inputs',()=>{
  const actions=Object.freeze([{name:'Burst (Recharge 6)'}]),expended=Object.freeze([] as string[]),roll=vi.fn(()=>6);
  expect(planMonsterRecharges(expended,actions,roll)).toEqual({remaining:[],rolls:[]});expect(roll).not.toHaveBeenCalled();
 });
});
