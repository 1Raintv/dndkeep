import {describe,expect,it} from 'vitest';
import {maximumPsionSpellLevel,replacePsionLevelUpSpells,replaceOwnedPsionLevelUpSpells,type SpellSources} from './psionSpellChoices';
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


describe('source-aware Psion replacement',()=>{
 const catalog=[{id:'old',level:1,classes:['Psion','Wizard']},{id:'next',level:2,classes:['Psion','Wizard']},{id:'cantrip',level:0,classes:['Psion','Wizard']},{id:'new-cantrip',level:0,classes:['Psion']}];
 const base={currentLevel:2,newLevel:3,known:['old'],prepared:['old'],granted:[],catalog,swaps:{spell:{from:'old',to:'next'}},sources:{old:['class:Psion']} as SpellSources};
 it('removes the last source, records the new source and leaves input untouched',()=>{
  expect(replaceOwnedPsionLevelUpSpells(base)).toEqual({ok:true,known:['next'],prepared:['next'],sources:{next:['class:Psion']}});
  expect(base.sources).toEqual({old:['class:Psion']});
 });
 it.each(['class:Wizard','feat','species','other'] as const)('retains a spell learned through %s',other=>{
  const result=replaceOwnedPsionLevelUpSpells({...base,sources:{old:['class:Psion',other]}});
  expect(result).toEqual({ok:true,known:['old','next'],prepared:['old','next'],sources:{old:[other],next:['class:Psion']}});
 });
 it('can learn a spell already known through another class without duplicating it',()=>{
  const result=replaceOwnedPsionLevelUpSpells({...base,known:['old','next'],sources:{old:['class:Psion'],next:['class:Wizard']}});
  expect(result).toEqual({ok:true,known:['next'],prepared:['next'],sources:{next:['class:Wizard','class:Psion']}});
 });
 it.each([{}, {old:['class:Wizard']}, {old:[]}] as SpellSources[])('requires an explicit Psion source for the outgoing spell',sources=>{
  expect(replaceOwnedPsionLevelUpSpells({...base,sources}).ok).toBe(false);
 });
 it('requires review before learning an already-known spell with unknown ownership',()=>{
  expect(replaceOwnedPsionLevelUpSpells({...base,known:['old','next']}).ok).toBe(false);
 });
 it('cannot learn the same spell twice through Psion',()=>{
  expect(replaceOwnedPsionLevelUpSpells({...base,known:['old','next'],sources:{old:['class:Psion'],next:['class:Psion']}}).ok).toBe(false);
 });
 it('continues protecting automatic grants despite an incorrect ownership claim',()=>{
  expect(replaceOwnedPsionLevelUpSpells({...base,granted:['old']}).ok).toBe(false);
 });
 it('retains the other class cantrip while replacing only the Psion copy',()=>{
  const result=replaceOwnedPsionLevelUpSpells({...base,known:['cantrip'],prepared:[],sources:{cantrip:['class:Psion','class:Wizard']},swaps:{cantrip:{from:'cantrip',to:'new-cantrip'}}});
  expect(result).toEqual({ok:true,known:['cantrip','new-cantrip'],prepared:[],sources:{cantrip:['class:Wizard'],'new-cantrip':['class:Psion']}});
 });
 it('skipping replacements does not invent sources for legacy selections',()=>{
  expect(replaceOwnedPsionLevelUpSpells({...base,swaps:{},sources:{}})).toEqual({ok:true,known:['old'],prepared:['old'],sources:{}});
 });
});
