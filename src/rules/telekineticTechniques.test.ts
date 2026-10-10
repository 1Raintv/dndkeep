import {expect,it} from 'vitest';
import {hasTelekineticDisorient,hasTelekineticBoost,telekineticTechniqueOptions,type TelekineticTechniqueContext} from './telekineticTechniques';
import {advanceMasteryExpiry} from './masteryExpiry';
const base:TelekineticTechniqueContext={caster:{class_name:'Psion',level:3,subclass:'Psykinetic'},outcome:'failed',mode:'technique',movement:'push',roll:3,casterParticipantId:'caster',targetParticipantId:'target'};
it('gives one menu of optional effects, with saved Force damage and distinct expiry owners',()=>{
 expect(telekineticTechniqueOptions(base)).toEqual([
  {kind:'boost',speedBonus:10,expiresAtStartOfTurnOf:'caster'},
  {kind:'disorient',preventsOpportunityAttacks:true,expiresAtStartOfTurnOf:'target'},
  {kind:'bolt',damageType:'Force',damage:3},
 ]);
});
it('offers Boost and Disorient without inventing a Bolt die for free 5-foot Propel',()=>{
 expect(telekineticTechniqueOptions({...base,mode:'free',roll:0}).map(e=>e.kind)).toEqual(['boost','disorient']);
});
it.each(['passed','cancelled',null] as const)('does not authorize effects on %s outcomes',outcome=>expect(telekineticTechniqueOptions({...base,outcome})).toEqual([]));
it.each(['Psi Warper','Metamorph','Telepath',null])('does not grant Psykinetic effects to %s',subclass=>expect(telekineticTechniqueOptions({...base,caster:{...base.caster,subclass}})).toEqual([]));
it('uses secondary Psion level and subclass, not total level or primary subclass',()=>{
 const caster={class_name:'Fighter',level:10,subclass:'Champion',secondary_class:'Psion',secondary_level:3,secondary_subclass:'Psykinetic'};
 expect(telekineticTechniqueOptions({...base,caster})).toHaveLength(3);
 expect(telekineticTechniqueOptions({...base,caster:{...caster,secondary_level:2}})).toEqual([]);
 expect(telekineticTechniqueOptions({...base,caster:{...caster,secondary_subclass:'Telepath'}})).toEqual([]);
});
it.each([0,-1,1.5,5,NaN,Infinity])('rejects malformed free-d4 result %s',roll=>expect(telekineticTechniqueOptions({...base,roll})).toEqual([]));
it('uses the finalized powered total, including paid high-level enhancements',()=>{
 const caster={...base.caster,level:20};
 expect(telekineticTechniqueOptions({...base,caster,mode:'powered',roll:19,enhancement:{originalRoll:2,enkindledRolls:[6,9],surged:true}}).find(e=>e.kind==='bolt')).toEqual({kind:'bolt',damageType:'Force',damage:19});
 expect(telekineticTechniqueOptions({...base,caster,mode:'powered',roll:20,enhancement:{originalRoll:2,enkindledRolls:[6,9],surged:true}})).toEqual([]);
 expect(telekineticTechniqueOptions({...base,mode:'powered',roll:7})).toEqual([]);
});
it('does not attach Energy Die enhancements to the substitute d4 or no-die use',()=>{
 for(const mode of ['free','technique'] as const)expect(telekineticTechniqueOptions({...base,mode,roll:mode==='free'?0:4,enhancement:{originalRoll:1,surged:true}})).toEqual([]);
});
it('requires distinct bound combat participants and normal push movement',()=>{
 for(const change of [{casterParticipantId:''},{targetParticipantId:' '},{targetParticipantId:'caster'},{movement:'warp' as const}])expect(telekineticTechniqueOptions({...base,...change})).toEqual([]);
});
it.each(['caster','target'])('the existing turn handler removes only the effect due on %s start',actor=>{
 const effects=telekineticTechniqueOptions(base).filter(e=>e.kind!=='bolt').map(e=>({...e,key:`telekinetic_${e.kind}`}));
 expect(advanceMasteryExpiry(effects,actor,'turn_end').removed).toEqual([]);
 const result=advanceMasteryExpiry(effects,actor,'turn_start');
 expect(result.removed.map(e=>e.kind)).toEqual([actor==='caster'?'boost':'disorient']);
 expect(result.next.map(e=>e.kind)).toEqual([actor==='caster'?'disorient':'boost']);
 expect(advanceMasteryExpiry(result.next,actor,'turn_start').removed).toEqual([]);
});

const boost=(caster:string)=>({key:`telekinetic_boost:${caster}`,technique:'boost',speedBonus:10,expiresAtStartOfTurnOf:caster});
it('retains overlapping Boost until the last source expires, without stacking',()=>{
 const buffs=[boost('first'),boost('second')];expect(hasTelekineticBoost(buffs)).toBe(true);
 const afterFirst=advanceMasteryExpiry(buffs,'first','turn_start').next;
 expect(hasTelekineticBoost(afterFirst)).toBe(true);
 expect(hasTelekineticBoost(advanceMasteryExpiry(afterFirst,'second','turn_start').next)).toBe(false);
});
it.each([null,{},[],[null,4,'boost'],[{key:'other',technique:'boost',speedBonus:10}],[{...boost('a'),speedBonus:100}],[{...boost('a'),speedBonus:'10'}],[{...boost('a'),technique:'disorient'}]])('does not grant Boost from malformed or unrelated effects %j',buffs=>expect(hasTelekineticBoost(buffs)).toBe(false));

const disorient={key:'telekinetic_disorient:declaration',technique:'disorient',preventsOpportunityAttacks:true,expiresAtStartOfTurnOf:'target'};
it('Disorient persists through other turns and target end, then clears at target start',()=>{
 expect(hasTelekineticDisorient(advanceMasteryExpiry([disorient],'caster','turn_start').next)).toBe(true);
 expect(hasTelekineticDisorient(advanceMasteryExpiry([disorient],'target','turn_end').next)).toBe(true);
 expect(hasTelekineticDisorient(advanceMasteryExpiry([disorient],'target','turn_start').next)).toBe(false);
});
it.each([null,{},[],[null,4,'disorient'],[boost('a')],[{...disorient,preventsOpportunityAttacks:'true'}],[{...disorient,technique:'boost'}],[{...disorient,key:'other'}]])('ignores unrelated or malformed Disorient %j',buffs=>expect(hasTelekineticDisorient(buffs)).toBe(false));
