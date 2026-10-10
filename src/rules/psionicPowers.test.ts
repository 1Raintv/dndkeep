import {describe,expect,it} from 'vitest';
import {psionicPowerState,resolvePsionicPower} from './psionicPowers';
const c={class_name:'Psion',level:5,subclass:'Telepath',class_resources:{'psionic-energy-dice':3,other:9},feature_uses:{Other:2}};
describe('Psion UA v2 power costs',()=>{
 it.each([true,false])('free Propel never spends a die (failed=%s)',failed=>{
  const r=resolvePsionicPower(c,{kind:'propel',mode:'free',roll:0},failed)!;
  expect(r.cost).toBe(0);expect(r.feet).toBe(failed?5:0);expect(r.patch.class_resources).toMatchObject({other:9});
 });
 it.each([true,false])('powered Propel spends only on failure (%s)',failed=>{
  const r=resolvePsionicPower(c,{kind:'propel',mode:'powered',roll:4},failed)!;
  expect(r.cost).toBe(failed?1:0);expect(r.feet).toBe(failed?20:0);
  expect(r.patch.class_resources['psionic-energy-dice']).toBe(failed?2:3);
 });
 it('requires a resolved save and a remaining die for powered Propel',()=>{
  expect(resolvePsionicPower(c,{kind:'propel',mode:'powered',roll:4})).toBeNull();
  expect(resolvePsionicPower({...c,class_resources:{'psionic-energy-dice':0}},{kind:'propel',mode:'powered',roll:4},false)).toBeNull();
  expect(resolvePsionicPower({...c,class_resources:{'psionic-energy-dice':0}},{kind:'propel',mode:'free',roll:0},true)?.feet).toBe(5);
 });
 it('first telepathy extension is free, later ones cost one, stale free uses are rejected',()=>{
  const use={kind:'connection',free:true,roll:4} as const;
  const first=resolvePsionicPower(c,use)!;
  expect(first.feet).toBe(70);expect(first.cost).toBe(0);expect(first.patch.feature_uses).toEqual({Other:2,'Telepathic Connection':1});
  const used={...c,...first.patch};expect(resolvePsionicPower(used,use)).toBeNull();
  expect(resolvePsionicPower(used,{...use,free:false})?.cost).toBe(1);
 });
 it('short-rest dice recovery preserves the used boost; long-rest feature reset restores it',()=>{
  const used={...c,feature_uses:{'Telepathic Connection':1}};
  expect(psionicPowerState({...used,class_resources:{'psionic-energy-dice':6}}).connectionFree).toBe(false);
  expect(psionicPowerState({...used,feature_uses:{}}).connectionFree).toBe(true);
 });
 it('requires a die available to roll, even on a free extension',()=>{
  expect(resolvePsionicPower({...c,class_resources:{'psionic-energy-dice':0}},{kind:'connection',free:true,roll:4})).toBeNull();
 });
 it('uses Telepath level-six base range, and permits free d4 only for Psykinetics level three+',()=>{
  expect(resolvePsionicPower({...c,level:6},{kind:'connection',free:true,roll:4})?.feet).toBe(100);
  const use={kind:'propel',mode:'technique',roll:3} as const;
  expect(resolvePsionicPower(c,use,true)).toBeNull();
  expect(resolvePsionicPower({...c,subclass:'Psykinetic',level:2},use,true)).toBeNull();
  expect(resolvePsionicPower({...c,subclass:'Psykinetic'},use,true)).toMatchObject({feet:15,cost:0});
 });
 it('rejects invalid rolls and wrong classes',()=>{
  expect(resolvePsionicPower(c,{kind:'connection',free:true,roll:9})).toBeNull();
  expect(resolvePsionicPower({...c,class_name:'Wizard'},{kind:'connection',free:true,roll:3})).toBeNull();
 });
 it('uninitialized pool matches the sheet pool',()=>{
  expect(resolvePsionicPower({...c,class_resources:{}},{kind:'propel',mode:'powered',roll:2},true)?.patch.class_resources['psionic-energy-dice']).toBe(5);
 });
});


it.each([NaN,Infinity,-1,1.5,'2',null,7])('refuses to settle or rewrite malformed pool %s',pool=>{
 const invalid={...c,class_resources:{'psionic-energy-dice':pool}};
 expect(psionicPowerState(invalid)).toMatchObject({valid:false,dice:0});
 expect(resolvePsionicPower(invalid,{kind:'propel',mode:'powered',roll:2},true)).toBeNull();
 expect(resolvePsionicPower(invalid,{kind:'propel',mode:'free',roll:0},true)).toBeNull();
 expect(resolvePsionicPower(invalid,{kind:'connection',roll:2,free:true})).toBeNull();
});
it.each([NaN,Infinity,0,-1,5.5,21])('refuses invalid level %s for powers',level=>{
 expect(resolvePsionicPower({...c,level},{kind:'connection',roll:2,free:true})).toBeNull();
});

it('Surge adjusts distance but preserves the original power expenditure condition',()=>{
 const eligible={...c,level:7,subclass:'Psi Warper'};
 const use={kind:'propel',mode:'powered',roll:4,originalRoll:1,surged:true} as const;
 expect(resolvePsionicPower(eligible,use,true)).toMatchObject({feet:20,cost:1});
 expect(resolvePsionicPower(eligible,use,false)).toMatchObject({feet:0,cost:0});
 expect(resolvePsionicPower(eligible,use,true)?.notes).toContain('1 treated as 4');
 expect(resolvePsionicPower(eligible,{kind:'connection',roll:4,originalRoll:1,surged:true,free:true})).toMatchObject({feet:70,cost:0});
});

it('adds Enkindled dice to distance without spending them from the Energy pool',()=>{
 const psion={...c,level:20};const use={kind:'propel',mode:'powered',roll:19,originalRoll:2,enkindledRolls:[6,9],surged:true} as const;
 expect(resolvePsionicPower(psion,use,true)).toMatchObject({feet:95,cost:1,patch:{class_resources:{'psionic-energy-dice':2}}});
 expect(resolvePsionicPower(psion,use,false)).toMatchObject({feet:0,cost:0});
 expect(resolvePsionicPower(psion,{...use,kind:'connection',free:true})).toMatchObject({feet:250,cost:0});
 expect(resolvePsionicPower({...psion,level:19},use,true)).toBeNull();
});

it('uses secondary Psion level and subclass for power dice, range and technique',()=>{
 const secondary={...c,class_name:'Fighter',level:11,subclass:'Champion',secondary_class:'Psion',secondary_level:6,secondary_subclass:'Telepath'};
 expect(psionicPowerState(secondary)).toMatchObject({valid:true,sides:8,telepathyRange:60,technique:false});
 expect(resolvePsionicPower(secondary,{kind:'connection',free:true,roll:8})).toMatchObject({feet:140,cost:0});
 expect(resolvePsionicPower(secondary,{kind:'connection',free:true,roll:10})).toBeNull();
 expect(psionicPowerState({...secondary,secondary_level:5}).telepathyRange).toBe(30);
 expect(resolvePsionicPower({...secondary,secondary_level:3,secondary_subclass:'Psykinetic'},
  {kind:'propel',mode:'technique',roll:4},true)).toMatchObject({feet:20,cost:0});
 expect(resolvePsionicPower({...secondary,secondary_level:2,secondary_subclass:'Psykinetic'},
  {kind:'propel',mode:'technique',roll:4},true)).toBeNull();
});
it.each([true,false])('Warp keeps caster-relative 30-foot destination and conditional die cost (%s)',failed=>{
 const r=resolvePsionicPower({...c,subclass:'Psi Warper'},{kind:'propel',movement:'warp',mode:'powered',roll:8},failed)!;
 expect(r.cost).toBe(failed?1:0);expect(r.feet).toBe(failed?30:0);expect(r.notes).not.toContain('40 ft');
 if(failed)expect(r.notes).toContain('horizontal to you');
});
it('Warp requires the subclass but does not require an Energy Die for the base use',()=>{
 const use={kind:'propel',movement:'warp',mode:'free',roll:0} as const;
 expect(resolvePsionicPower(c,use,true)).toBeNull();
 expect(resolvePsionicPower({...c,subclass:'Psi Warper',level:2},use,true)).toBeNull();
 expect(resolvePsionicPower({...c,subclass:'Psi Warper',class_resources:{'psionic-energy-dice':0}},use,true)).toMatchObject({cost:0,feet:30});
});


it.each([null,'0',false,-1,0.5,NaN,Infinity,2147483647])('rejects malformed Connection counter %s without blocking Propel',raw=>{
 const invalid={...c,feature_uses:{'Telepathic Connection':raw}} as unknown as typeof c;
 expect(psionicPowerState(invalid)).toMatchObject({valid:true,connectionValid:false,connectionFree:false});
 for(const free of [true,false])expect(resolvePsionicPower(invalid,{kind:'connection',free,roll:4})).toBeNull();
 expect(resolvePsionicPower(invalid,{kind:'propel',mode:'free',roll:0},true)).toMatchObject({feet:5,cost:0});
});
it.each([undefined,0,1,2147483646])('accepts valid Connection counter %s including missing legacy value',uses=>{
 const feature_uses:Record<string,number>=uses===undefined?{}:{'Telepathic Connection':uses};
 const saved={...c,feature_uses};
 const free=uses===undefined||uses===0;
 expect(psionicPowerState(saved)).toMatchObject({connectionValid:true,connectionFree:free});
 expect(resolvePsionicPower(saved,{kind:'connection',free,roll:4})).toMatchObject({cost:free?0:1,patch:{feature_uses:{'Telepathic Connection':(uses??0)+1}}});
});


it.each(['free','technique'] as const)('rejects Energy Die enhancements on %s Propel',mode=>{
 const psykinetic={...c,level:20,subclass:'Psykinetic'};
 const base={kind:'propel' as const,mode,roll:mode==='free'?0:4};
 expect(resolvePsionicPower(psykinetic,base,true)).toMatchObject({cost:0,feet:mode==='free'?5:20});
 for(const enhancement of [{surged:true,originalRoll:1},{enkindledRolls:[2],originalRoll:2},{originalRoll:4}]) {
  for(const failed of [true,false])expect(resolvePsionicPower(psykinetic,{...base,...enhancement},failed)).toBeNull();
 }
});
it.each([1,-1,NaN,Infinity])('rejects a fabricated roll on the no-die push (%s)',roll=>{
 expect(resolvePsionicPower(c,{kind:'propel',mode:'free',roll},true)).toBeNull();
});
