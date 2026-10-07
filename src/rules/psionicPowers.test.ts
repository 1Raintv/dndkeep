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
