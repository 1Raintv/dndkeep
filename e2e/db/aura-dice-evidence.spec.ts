import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {savingThrowPassed,exhaustionPenalty} from '../../src/rules/savingThrows';
import {parseDiceGroups,validDiceGroups} from '../../src/rules/dice';
import {rollSaveBonuses,validSaveBonusRolls} from '../../src/rules/saveBonuses';
import {auraSaveEvidence} from '../../src/rules/auraSaveEvidence';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const dice=(expression:string,evidence:unknown)=>`select dndkeep_private.dice_evidence_total('${expression.replaceAll("'","''")}',${literal(evidence)})`;
const bonuses=(buffs:unknown,rolls:unknown,automatic=false)=>`select dndkeep_private.save_bonus_evidence_total(${literal(buffs)},${literal(rolls)},${automatic})`;
test.describe('Server aura dice evidence',()=>{
 gateDbSuite();
 test('server totals match canonical plans across mixed groups, constants and bounds',()=>{
  for(const expression of ['0','17','1d4','2d6+1d8-2','1D20 + 2','100d1000','01d004+003','0-5','3d8-100','9007199254740991','0-9007199254740991','2d1+5-3','1\td4 + 2']){
   const plan=parseDiceGroups(expression)!;expect(plan).not.toBeNull();
   for(const upper of [false,true]){
    const evidence={dice:plan.sides.map(die=>({die,value:upper?die:1})),modifier:plan.modifier,total:plan.sides.reduce((n,die)=>n+(upper?die:1),plan.modifier)};
    expect(validDiceGroups(expression,evidence)).toBe(true);expect(Number(sql(dice(expression,evidence)))).toBe(evidence.total);
   }
  }
 });
 test('unsupported expressions fail on both sides instead of becoming zero damage',()=>{
  for(const expression of ['','special','d6','0d6','1d0','101d6','1d1001','1d6+','1d6-1d4','9007199254740991+1','9007199254740991+1d4','0-9007199254740991-1']){
   expect(parseDiceGroups(expression)).toBeNull();expect(()=>sql(dice(expression,{dice:[],modifier:0,total:0}))).toThrow();
  }
 });
 test('server rejects changed faces, counts, modifiers and totals',()=>{
  const valid={dice:[{die:4,value:2}],modifier:1,total:3};
  for(const evidence of [null,{}, {...valid,dice:[]},{...valid,dice:[{die:6,value:2}]},{...valid,dice:[{die:4,value:0}]},{...valid,dice:[{die:4,value:5}]},{...valid,dice:[{die:4,value:2.5}]},{...valid,dice:[{die:4,value:'2'}]},{...valid,modifier:2},{...valid,total:4},{...valid,total:'3'}]){
   expect(validDiceGroups('1d4+1',evidence)).toBe(false);expect(()=>sql(dice('1d4+1',evidence))).toThrow();
  }
 });
 test('save evidence matches canonical Bless/Bane, flat and signed effects',()=>{
  for(const buffs of [[],[{name:'Bless'},{name:'Bless',saveBonus:'1d4'},{name:'Bane'}],[{name:'Ward',saveBonus:2},{name:'Curse',saveBonus:'-2d4'}],[{name:'Flat',saveBonus:' -3 '}],[{name:'Mixed',saveBonus:'1d4+1d6-2'},{name:'Haste'}],[{name:'\tBLESS\n',saveBonus:0},{name:'Bane',saveBonus:0}],[{saveBonus:1}],[{name:'Zero',saveBonus:0}]]){
   const evidence=rollSaveBonuses(buffs,0);expect(validSaveBonusRolls(evidence.rolls)).toBe(true);
   expect(Number(sql(bonuses(buffs,evidence.rolls)))).toBe(evidence.bonus);
  }
 });
 test('saved bonuses cannot omit penalties, add effects, reorder or alter signs',()=>{
  const buffs=[{name:'Bless'},{name:'Bane'},{name:'Ward',saveBonus:2}],original=rollSaveBonuses(buffs,0).rolls;
  for(const evidence of [original.slice(0,2),[...original,original[0]],[...original].reverse(),original.map((r,i)=>i===1?{...r,multiplier:undefined,total:-r.total}:r),original.map((r,i)=>i===0?{...r,multiplier:-1,total:-r.total}:r),original.map((r,i)=>i===0?{...r,expression:'1d20'}:r),original.map((r,i)=>i===0?{...r,name:'Other'}:r)]){
   expect(()=>sql(bonuses(buffs,evidence))).toThrow();
  }
  expect(()=>sql(bonuses([...buffs,{name:'New penalty',saveBonus:-1}],original))).toThrow();
 });
 test('automatic failures accept no bonus dice and return zero',()=>{
  expect(sql(bonuses([{name:'Bless'}],[],true))).toBe('0');
  expect(()=>sql(bonuses([{name:'Bless'}],rollSaveBonuses([{name:'Bless'}],0).rolls,true))).toThrow(/does not roll/);
 });
 test('malformed current effects and unsafe totals require review',()=>{
  for(const buffs of [null,{},[null],[{name:'Unknown',saveBonus:null}],[{name:'Unknown',saveBonus:true}],[{name:'Unknown',saveBonus:1.5}],[{name:'Unknown',saveBonus:'special'}]])expect(()=>sql(bonuses(buffs,[]))).toThrow();
  const buffs=[{name:'Too much',saveBonus:101}];expect(()=>sql(bonuses(buffs,[{name:'Too much',expression:'101',dice:[],modifier:101,total:101}]))).toThrow(/combined/);
 });
 test('validators are private and contain no random or write operation',()=>{
  for(const role of ['anon','authenticated']){
   expect(()=>sql(`set role ${role};`+dice('1',{dice:[],modifier:1,total:1}))).toThrow(/permission denied/);
   expect(()=>sql(`set role ${role};`+bonuses([],[]))).toThrow(/permission denied/);
  }
  expect(sql("select string_agg(provolatile::text,',' order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='dndkeep_private' and proname in('dice_evidence_total','save_bonus_evidence_total')")).toBe('i,i');
 });
 const context=(flags:Record<string,unknown>={})=>({save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[],...flags},aura:{aura:{saveAbility:'WIS',saveDC:15}},target:{participant:{id:'target'}}});
 const save=(c:unknown,p:unknown,penalty=0)=>`select dndkeep_private.aura_save_evidence(${literal(c)},${literal(p)},${penalty})`;
 test('save selection, exhaustion and natural extremes match the canonical rules',()=>{
  for(const advantage of [false,true])for(const disadvantage of [false,true])for(const naturalExtremes of [false,true]){
   const dice=advantage!==disadvantage?[1,20]:[20],c=context({advantage,disadvantage,naturalExtremes,exhaustion:2});
   const chosen=advantage!==disadvantage?(advantage?20:1):20,bonus=2-exhaustionPenalty(2)-3;
   const evidence=JSON.parse(sql(save(c,{baseBonus:2,dice,effectRolls:[]},3)));
   expect(evidence).toEqual(auraSaveEvidence(c,{baseBonus:2,dice,effectRolls:[]},3));
   expect(evidence).toMatchObject({d20:chosen,dice,bonus,total:chosen+bonus,passed:savingThrowPassed(chosen,chosen+bonus,15,{naturalExtremes})});
  }
 });
 test('confirmed buff faces contribute once before the next-save penalty',()=>{
  const buffs=[{name:'Bless'},{name:'Bane'},{name:'Flat',saveBonus:2}],effects=rollSaveBonuses(buffs,0);
  const evidence=JSON.parse(sql(save(context({buffs}),{baseBonus:5,dice:[10],effectRolls:effects.rolls},4)));
  expect(evidence).toEqual(auraSaveEvidence(context({buffs}),{baseBonus:5,dice:[10],effectRolls:effects.rolls},4));
  expect(evidence).toMatchObject({buffTotal:effects.bonus,penalty:4,bonus:5+effects.bonus-4,total:15+effects.bonus-4});
 });
 test('automatic failure keeps no cosmetic face, total or bonus dice',()=>{
  const c=context({autoFail:true,buffs:[{name:'Bless'}],naturalExtremes:true});
  expect(JSON.parse(sql(save(c,{baseBonus:0,dice:[],effectRolls:[]})))).toEqual(auraSaveEvidence(c,{baseBonus:0,dice:[],effectRolls:[]},0));
  expect(JSON.parse(sql(save(c,{baseBonus:0,dice:[],effectRolls:[]})))).toMatchObject({d20:null,total:null,bonus:0,passed:false,automaticFailure:true});
  for(const p of [{baseBonus:0,dice:[20],effectRolls:[]},{baseBonus:1,dice:[],effectRolls:[]}])expect(()=>sql(save(c,p))).toThrow();
  expect(()=>sql(save(c,{baseBonus:0,dice:[],effectRolls:[]},1))).toThrow();
 });
 test('browser flags, forged totals and wrong dice counts cannot choose save outcomes',()=>{
  for(const p of [{baseBonus:0,dice:[20],effectRolls:[],passed:true},{baseBonus:0,dice:[20],effectRolls:[],dc:0},{baseBonus:0,dice:[20],effectRolls:[],total:99},{baseBonus:0,dice:[20,1],effectRolls:[]},{baseBonus:0,dice:[21],effectRolls:[]},{baseBonus:0.5,dice:[10],effectRolls:[]}])expect(()=>sql(save(context(),p))).toThrow();
  expect(()=>sql(save(context({advantage:true}),{baseBonus:0,dice:[20],effectRolls:[]}))).toThrow();
  expect(()=>sql(`set role authenticated;`+save(context(),{baseBonus:0,dice:[20],effectRolls:[]}))).toThrow(/permission denied/);
 });

});
