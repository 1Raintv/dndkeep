import {afterEach,expect,it,vi} from 'vitest';
import {rollSaveBonuses,validSaveBonusRolls,savedSaveBonusTotal} from './saveBonuses';
afterEach(()=>vi.restoreAllMocks());
it('combines actual Bless dice and equipment bonuses without an ability modifier',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);
 expect(rollSaveBonuses([{name:'Bless',saveBonus:'1d4'}],2)).toEqual({bonus:3,rolls:[{name:'Bless',expression:'1d4',total:1,modifier:0,dice:[{die:4,value:1}]}]});
});
it('retains flat effects and ignores effects with no save bonus',()=>{
 expect(rollSaveBonuses([{name:'Ward',saveBonus:2},{name:'Penalty',saveBonus:-1},{name:'Haste'}],1)).toMatchObject({bonus:2,rolls:[{total:2,dice:[]},{total:-1,dice:[]}]});
});
it('rejects an unsupported expression instead of silently dropping it',()=>{expect(()=>rollSaveBonuses([{name:'Unknown',saveBonus:'special'}],0)).toThrow('cannot be rolled');});
it('rejects malformed effects and unsafe combined modifiers',()=>{expect(()=>rollSaveBonuses([null],0)).toThrow();expect(()=>rollSaveBonuses([],101)).toThrow();expect(()=>rollSaveBonuses([],NaN)).toThrow();});

it('handles legacy Bless and Bane metadata once per named spell',()=>{
 vi.spyOn(Math,'random').mockReturnValueOnce(0).mockReturnValueOnce(.75);
 const r=rollSaveBonuses([{name:'Bless',saveBonus:0},{name:'Bless',saveBonus:'1d4'},{name:'Bane'}],0);
 expect(r.bonus).toBe(-3);expect(r.rolls).toHaveLength(2);expect(r.rolls[1]).toMatchObject({total:-4,multiplier:-1,dice:[{die:4,value:4}]});expect(validSaveBonusRolls(r.rolls)).toBe(true);
});
it('keeps negative effect dice positive in evidence and rejects altered totals',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);const r=rollSaveBonuses([{name:'Curse',saveBonus:'-1d4'}],0);
 expect(r.bonus).toBe(-3);expect(validSaveBonusRolls(r.rolls)).toBe(true);r.rolls[0].total=3;expect(validSaveBonusRolls(r.rolls)).toBe(false);
});

it.each([
 {expression:'1d4',dice:[{die:20,value:3}],modifier:0,total:3},
 {expression:'2d4',dice:[{die:4,value:3}],modifier:0,total:3},
 {expression:'1d4+2',dice:[{die:4,value:3}],modifier:0,total:3},
 {expression:'special',dice:[{die:4,value:3}],modifier:0,total:3},
 {expression:'1d4',dice:[{die:4,value:3}],modifier:0,total:-3,multiplier:-1},
 {expression:'-1d4',dice:[{die:4,value:3}],modifier:0,total:3},
 {expression:'2',dice:[{die:4,value:2}],modifier:0,total:2},
])('rejects saved arithmetic that does not match its expression: %j',evidence=>{
 const random=vi.spyOn(Math,'random');expect(validSaveBonusRolls([{name:'Effect',...evidence}])).toBe(false);expect(random).not.toHaveBeenCalled();
});

it('validates saved bonuses against all original effects without rerolling',()=>{
 const buffs=[{name:'Bless'},{name:'Bane'},{name:'Ward',saveBonus:2}];
 const saved=rollSaveBonuses(buffs,0);const rng=vi.spyOn(Math,'random');
 expect(savedSaveBonusTotal(buffs,saved.rolls)).toBe(saved.bonus);
 for(const rolls of [saved.rolls.slice(0,2),[...saved.rolls,saved.rolls[0]],[...saved.rolls].reverse(),saved.rolls.map((r,i)=>i===1?{...r,name:'Bless'}:r)])
  expect(()=>savedSaveBonusTotal(buffs,rolls)).toThrow();
 expect(rng).not.toHaveBeenCalled();
});
it('normalizes duplicate named spells identically for rolling and recovery',()=>{
 const buffs=[{name:' BLESS '},{name:'bless',saveBonus:0},{name:'Bane',saveBonus:0},{saveBonus:' -2 '}];
 const saved=rollSaveBonuses(buffs,0);expect(savedSaveBonusTotal(buffs,saved.rolls)).toBe(saved.bonus);
});
it.each([null,true,[],[2],{},1.5])('rejects malformed source bonus %j even with plausible saved arithmetic',saveBonus=>{
 const rolls=[{name:'Bad',expression:String(saveBonus),dice:[],modifier:2,total:2}];
 expect(()=>savedSaveBonusTotal([{name:'Bad',saveBonus}],rolls)).toThrow();
});
it('allows no bonus evidence on automatic failure and bounds the combined bonus',()=>{
 expect(savedSaveBonusTotal([{name:'Bless'}],[],true)).toBe(0);
 const rolls=[{name:'Huge',expression:'101',dice:[],modifier:101,total:101}];
 expect(()=>savedSaveBonusTotal([{name:'Huge',saveBonus:101}],rolls)).toThrow();
 expect(()=>savedSaveBonusTotal([],rolls,true)).toThrow();
});
