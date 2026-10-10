import {afterEach,expect,it,vi} from 'vitest';
import {rollSaveBonuses,validSaveBonusRolls} from './saveBonuses';
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
