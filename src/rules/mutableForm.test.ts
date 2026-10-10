import {expect,it} from 'vitest';
import {validMutableFormSpec,MUTABLE_FORM_RESISTANCES,mutableFormBenefits,mutableFormEligibility,mutableFormSpellRange,planMutableForm,type MutableFormChoice} from './mutableForm';
const hero={class_name:'Psion',subclass:'Metamorph',level:3,class_resources:{'psionic-energy-dice':4}};
const base={fleshWeaver:false,improvement:null};
it('uses the Bonus Action activation cost and one rolled die for temporary HP',()=>{
 expect(planMutableForm(hero,base,4,3)).toEqual({cost:1,remaining:3,temporaryHitPoints:7,form:{...base,durationSeconds:60}});
 expect(hero.class_resources['psionic-energy-dice']).toBe(4);
 expect(planMutableForm(hero,base,1,-5)?.temporaryHitPoints).toBe(1);
});
it.each([2,2.5,21])('rejects invalid or insufficient Psion level %s',level=>expect(planMutableForm({...hero,level},base,1,0)).toBeNull());
it.each(['Psykinetic','Telepath','Psi Warper',null])('rejects subclass %s',subclass=>expect(planMutableForm({...hero,subclass},base,1,0)).toBeNull());
it('uses Psion levels in either class order, not total character level',()=>{
 const c={...hero,class_name:'Fighter',level:17,subclass:'Champion',secondary_class:'Psion',secondary_level:3,secondary_subclass:'Metamorph'};
 expect(planMutableForm(c,base,2,0)?.form.durationSeconds).toBe(60);
 expect(planMutableForm(c,{...base,fleshWeaver:true},2,0)).toBeNull();
 expect(planMutableForm({...c,secondary_level:4},base,2,0)).toBeNull();
});
it.each([0,null,'4',1.5,5])('rejects exhausted/malformed level-3 pool %s',pool=>expect(planMutableForm({...hero,class_resources:{'psionic-energy-dice':pool}},base,2,0)).toBeNull());
it('accepts the legacy missing pool and charges two dice for Flesh Weaver only at six',()=>{
 expect(planMutableForm({...hero,class_resources:{}},base,2,0)?.remaining).toBe(3);
 expect(planMutableForm({...hero,level:5},{...base,fleshWeaver:true},2,0)).toBeNull();
 const result=planMutableForm({...hero,level:6},{...base,fleshWeaver:true},8,2)!;
 expect(result).toMatchObject({cost:2,remaining:2,temporaryHitPoints:10});
 expect(mutableFormBenefits(result.form,false)).toMatchObject({acBonus:2,empoweredHealing:true});
 expect(planMutableForm({...hero,level:6,class_resources:{'psionic-energy-dice':1}},{...base,fleshWeaver:true},2,0)).toBeNull();
});
it('requires exactly one improved choice at level ten, and none below it',()=>{
 expect(planMutableForm({...hero,level:10},base,2,0)).toBeNull();
 expect(planMutableForm({...hero,level:9},{...base,improvement:{kind:'stride'}},2,0)).toBeNull();
 const r=planMutableForm({...hero,level:10},{...base,improvement:{kind:'stride'}},2,0)!;
 expect(r.form.durationSeconds).toBe(600);
 expect(mutableFormBenefits(r.form,false)).toMatchObject({speedBonus:5,reachBonus:5,bonusActionDash:true,climbAndSwimEqualSpeed:true});
 expect(mutableFormBenefits(r.form,true)).toMatchObject({speedBonus:5,reachBonus:5,bonusActionDash:false,climbAndSwimEqualSpeed:false});
});
it.each(MUTABLE_FORM_RESISTANCES)('supports Stony Epidermis resistance %s and concentration-only advantage',resistance=>{
 const r=planMutableForm({...hero,level:10},{...base,improvement:{kind:'stony',resistance}},2,0)!;
 expect(mutableFormBenefits(r.form,true)).toMatchObject({resistance,concentrationSaveAdvantage:true,acBonus:0});
});
it.each([{kind:'stony',resistance:'Psychic'},{kind:'stony',resistance:'Force'},{kind:'stony'},{kind:'stride',resistance:'Acid'},{kind:'unknown'}])('rejects invalid improved choice %j',improvement=>{
 expect(planMutableForm({...hero,level:10},{...base,improvement:improvement as MutableFormChoice},2,0)).toBeNull();
});
it('stacks Flesh Weaver and Unnatural Flexibility without granting Stride or Stony benefits',()=>{
 const r=planMutableForm({...hero,level:10},{fleshWeaver:true,improvement:{kind:'flexibility'}},2,0)!;
 expect(mutableFormBenefits(r.form,false)).toEqual({reachBonus:5,speedBonus:5,touchActionRange:10,acBonus:3,empoweredHealing:true,concentrationSaveAdvantage:false,resistance:null,bonusActionDash:false,climbAndSwimEqualSpeed:false,minimumSpaceInches:1,escapeMovementFeet:5});
});
it('validates original and enhanced dice through the canonical Psion roll rules',()=>{
 expect(planMutableForm(hero,base,7,0)).toBeNull();
 expect(planMutableForm(hero,base,2,0,{originalRoll:1})).toBeNull();
 expect(planMutableForm({...hero,level:7},base,4,0,{surged:true,originalRoll:1})?.temporaryHitPoints).toBe(4);
 const options={...base,improvement:{kind:'stride'} as const};
 expect(planMutableForm({...hero,level:20},options,12,0,{surged:true,originalRoll:1,enkindledRolls:[2,3]})?.temporaryHitPoints).toBe(12);
});
it.each([NaN,Infinity,1.5,-6,11])('rejects invalid effective Intelligence modifier %s',modifier=>expect(planMutableForm(hero,base,2,modifier)).toBeNull());
it('does not retain the mutable caller choice or grant eligibility from duplicate classes',()=>{
 const improvement:MutableFormChoice={kind:'stony',resistance:'Acid'};
 const r=planMutableForm({...hero,level:10},{...base,improvement},2,0)!;
 improvement.resistance='Fire';expect(r.form.improvement).toEqual({kind:'stony',resistance:'Acid'});
 expect(mutableFormEligibility({...hero,secondary_class:'Psion',secondary_level:1}).eligible).toBe(false);
});
it.each(['1 action','1 Action','1 Magic action'])('optionally extends a Touch spell with casting time %s',casting_time=>{
 const spell={range:'Touch',casting_time};expect(mutableFormSpellRange(spell,true)).toBe('10 feet');expect(mutableFormSpellRange(spell,false)).toBe('Touch');expect(spell.range).toBe('Touch');
});
it.each(['1 bonus action','1 reaction','1 minute','2 actions'])('does not extend casting time %s',casting_time=>expect(mutableFormSpellRange({range:'Touch',casting_time},true)).toBe('Touch'));
it('does not replace other spell ranges',()=>expect(mutableFormSpellRange({range:'30 feet',casting_time:'1 action'},true)).toBe('30 feet'));

it.each([null,undefined,[],{},0,{durationSeconds:600,fleshWeaver:false,improvement:null}])('rejects malformed form spec %j',v=>expect(validMutableFormSpec(v)).toBe(false));
it('validates base and improved saved form specs',()=>{
 expect(validMutableFormSpec({durationSeconds:60,fleshWeaver:false,improvement:null})).toBe(true);
 expect(validMutableFormSpec({durationSeconds:600,fleshWeaver:true,improvement:{kind:'stony',resistance:'Cold'}})).toBe(true);
});
