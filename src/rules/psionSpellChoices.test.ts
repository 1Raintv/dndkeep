import {describe,expect,it} from 'vitest';
import {maximumPsionSpellLevel,replacePsionLevelUpSpells} from './psionSpellChoices';
it.each([1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9].map((max,index)=>[index+1,max]))('Psion level %i permits spell level %i',(level,max)=>{
 expect(maximumPsionSpellLevel(level)).toBe(max);
});
it.each([0,-1,21,1.5,NaN,Infinity])('rejects invalid class level %s',level=>expect(maximumPsionSpellLevel(level)).toBe(0));


describe('Psion level-up replacements',()=>{
 const catalog=[
  {id:'old-cantrip',level:0,classes:['Psion']},{id:'new-cantrip',level:0,classes:['Psion']},
  {id:'old-spell',level:1,classes:['Psion']},{id:'new-spell',level:2,classes:['Psion']},
  {id:'too-high',level:3,classes:['Psion']},{id:'grant',level:1,classes:['Psion']},
  {id:'other-class',level:1,classes:['Wizard']},
 ];
 const base={currentLevel:2,newLevel:3,known:['old-cantrip','old-spell','grant'],prepared:['old-spell','grant'],granted:['grant'],catalog,swaps:{}};
 it('keeps both choices when replacements are skipped',()=>{
  expect(replacePsionLevelUpSpells(base)).toEqual({ok:true,known:base.known,prepared:base.prepared});
 });
 it('allows one of each and prepares the replacement spell without losing grants',()=>{
  const result=replacePsionLevelUpSpells({...base,swaps:{cantrip:{from:'old-cantrip',to:'new-cantrip'},spell:{from:'old-spell',to:'new-spell'}}});
  expect(result).toEqual({ok:true,known:['grant','new-cantrip','new-spell'],prepared:['grant','new-spell']});
  expect(base.known).toEqual(['old-cantrip','old-spell','grant']);
 });
 it.each([
  {from:'grant',to:'new-spell'}, {from:'old-spell',to:'grant'},
  {from:'missing',to:'new-spell'}, {from:'old-spell',to:'missing'},
  {from:'old-spell',to:'old-spell'}, {from:'old-spell',to:'other-class'},
  {from:'old-spell',to:'too-high'}, {from:'old-cantrip',to:'new-spell'},
  {from:'old-spell',to:'new-cantrip'},
 ])('rejects ineligible leveled replacement %j',spell=>{
  expect(replacePsionLevelUpSpells({...base,swaps:{spell}}).ok).toBe(false);
 });
 it.each([[2,2],[2,4],[0,1],[20,21],[2.5,3.5]])('rejects invalid level transition %s to %s',(currentLevel,newLevel)=>{
  expect(replacePsionLevelUpSpells({...base,currentLevel,newLevel}).ok).toBe(false);
 });
});
