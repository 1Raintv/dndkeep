import {afterEach,expect,it,vi} from 'vitest';
import {rollDeathSaveBonuses} from './deathSaveBonuses';
afterEach(()=>vi.restoreAllMocks());
it('combines actual Bless dice and equipment bonuses without an ability modifier',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);
 expect(rollDeathSaveBonuses([{name:'Bless',saveBonus:'1d4'}],2)).toEqual({bonus:3,rolls:[{name:'Bless',expression:'1d4',total:1,modifier:0,dice:[{die:4,value:1}]}]});
});
it('retains flat effects and ignores effects with no save bonus',()=>{
 expect(rollDeathSaveBonuses([{name:'Ward',saveBonus:2},{name:'Penalty',saveBonus:-1},{name:'Haste'}],1)).toMatchObject({bonus:2,rolls:[{total:2,dice:[]},{total:-1,dice:[]}]});
});
it('rejects an unsupported expression instead of silently dropping it',()=>{expect(()=>rollDeathSaveBonuses([{name:'Unknown',saveBonus:'special'}],0)).toThrow('cannot be rolled');});
it('rejects malformed effects and unsafe combined modifiers',()=>{expect(()=>rollDeathSaveBonuses([null],0)).toThrow();expect(()=>rollDeathSaveBonuses([],101)).toThrow();expect(()=>rollDeathSaveBonuses([],NaN)).toThrow();});
