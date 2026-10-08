import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
import {damageRollComponent} from '../../src/rules/damageComponents';
import {previewTypedSharpenedReplacement,resolveTypedDamage,type TypedDamageDefenses,type TypedDamageAdjustment} from '../../src/rules/typedDamage';
import type {SharpenedDamageSource} from '../../src/rules/sharpenedMindDamage';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const packet=(amounts:[string,number][])=>({version:1 as const,components:amounts.map(([damageType,n],i)=>damageRollComponent({key:i?'rider:'+i:'base',source:i?'rider':'base',label:'Damage',damageType,expression:String(n),rolls:[],modifier:n,rawTotal:n}))});
const none:TypedDamageDefenses={immune:[],resistant:[],vulnerable:[]};
const target=(defenses=none)=>({definitionType:'character',definition:{damage_immunities:defenses.immune,damage_resistances:defenses.resistant,damage_vulnerabilities:defenses.vulnerable},combatant:{active_buffs:[],active_conditions:defenses.resistanceAll?['Petrified']:[]}});
const calculate=(record:unknown=packet([['psychic',5],['fire',3]]),participant:unknown=target(),adjustments:unknown={},sharpened:unknown={})=>JSON.parse(sql(`select dndkeep_private.resolve_pending_typed_damage(${encoded(record)},${encoded(participant)},${encoded(adjustments)},${encoded(sharpened)})`));
test.describe('Server typed damage arithmetic (local stack)',()=>{
 gateDbSuite();
 test('server and rule preview agree across 120 mixed damage, defense and rounding combinations',()=>{
  const cases:{record:ReturnType<typeof packet>;defenses:TypedDamageDefenses;adjustments:TypedDamageAdjustment;sharpened:{active:boolean;sources:Record<string,SharpenedDamageSource>}}[]=[];
  for(const n of [0,1,5,47])for(const defenses of [none,{...none,resistant:['psychic','fire']},{...none,immune:['psychic'],vulnerable:['fire']},{...none,resistant:['psychic'],vulnerable:['psychic']},{...none,resistanceAll:true}])
   for(const multiplier of [0,0.5,1] as const)for(const active of [false,true])cases.push({record:packet([['psychic',n],['psychic',3],['fire',5]]),defenses,adjustments:{multiplier},sharpened:{active,sources:{base:'weapon-attack','rider:1':'weapon-attack','rider:2':'weapon-attack'}}});
  const rows=cases.map((c,i)=>`(${i},${encoded(c.record)},${encoded(target(c.defenses))},${encoded(c.adjustments)},${encoded(c.sharpened)})`).join(',');
  const actual=JSON.parse(sql(`select jsonb_agg(dndkeep_private.resolve_pending_typed_damage(r,t,a,s) order by i) from (values ${rows}) v(i,r,t,a,s)`));
  expect(actual).toEqual(cases.map(c=>resolveTypedDamage(c.record,c.defenses,c.adjustments,c.sharpened)));
 });
 test('unrelated Psychic rider does not inherit weapon resistance bypass',()=>{
  const record=packet([['psychic',5],['psychic',3],['fire',7]]),d={...none,resistant:['psychic','fire']},s={active:true,sources:{base:'weapon-attack' as const,'rider:1':'other' as const}};
  expect(calculate(record,target(d),{},s)).toEqual(resolveTypedDamage(record,d,{},s));
  expect(calculate(record,target(d),{},s).total).toBe(9);
 });
 test('conditional defenses need a reviewed affinity',()=>{
  const t=target({...none,resistant:['cold when wet']});
  expect(()=>calculate(packet([['cold',15]]),t)).toThrow(/conditional damage defenses/);
  expect(calculate(packet([['cold',15]]),t,{affinities:{cold:'resistant'}}).total).toBe(7);
 });
 test('Petrified and reaction resistance do not stack and cannot be cleared by normal override',()=>{
  expect(calculate(packet([['cold',15]]),target({...none,resistanceAll:true}),{affinities:{cold:'normal'},resistantTypes:['cold']}).total).toBe(7);
 });
 test('same-type bypass groups require explicit half allocation',()=>{
  expect(()=>calculate(packet([['psychic',5],['psychic',3]]),target({...none,resistant:['psychic']}),{multiplier:0.5},{active:true,sources:{base:'psion-spell'}})).toThrow(/explicit adjustment allocation/);
 });
 test('a missing rider type cannot be silently assigned the weapon type',()=>{
  expect(()=>calculate(packet([['slashing',5],['untyped',3]]))).toThrow(/typed damage component/);
 });
 test('unknown damage types are not treated as undefended damage',()=>{
  expect(()=>calculate(packet([['psychic',5],['made-up',3]]))).toThrow(/damage type/);
 });
 test('corrupt totals, dice and duplicate component IDs are rejected',()=>{
  const r=packet([['psychic',5],['fire',3]]);
  for(const bad of [null,{}, {...r,version:2},{...r,components:[r.components[0],r.components[0]]},{...r,components:[{...r.components[0],rawTotal:6}]},{...r,components:[{...r.components[0],rolls:[0],dieKinds:['rolled']}]},{...r,components:[{...r.components[0],rolls:[5],modifier:0,dieKinds:['invented']}]}])expect(()=>calculate(bad)).toThrow();
 });
 test('unsupported multipliers and database HP overflow are rejected',()=>{
  expect(()=>calculate(undefined,undefined,{multiplier:0.25})).toThrow(/adjustment/);
  expect(()=>calculate(packet([['psychic',2147483647]]),target({...none,vulnerable:['psychic']}))).toThrow(/supported number range/);
 });
 test('mixed replacement matches the rule preview before saves and separate defenses',()=>{
  const r={version:1 as const,components:[damageRollComponent({key:'base',source:'base',label:'Blade',damageType:'slashing',expression:'1d8+3',rolls:[2],modifier:3,rawTotal:5}),damageRollComponent({key:'rider:psychic',source:'rider',label:'Psychic',damageType:'psychic',expression:'1d6',rolls:[3],modifier:0,rawTotal:3})]};
  const sharpened={active:true,usedThisTurn:false,recordedNumber:8,sources:{base:'weapon-attack','rider:psychic':'weapon-attack'} as const},defenses={...none,resistant:['slashing','psychic']};
  for(const multiplier of [1,0.5] as const)for(const componentKey of ['base','rider:psychic']){
   const adjustments={multiplier},selection={componentKey,dieIndex:0};
   expect(JSON.parse(sql(`select dndkeep_private.preview_pending_typed_replacement(${encoded(r)},${encoded(target(defenses))},${encoded(adjustments)},${encoded(sharpened)},${encoded(selection)})`)))
    .toEqual(previewTypedSharpenedReplacement(r,defenses,adjustments,sharpened,selection));
  }
 });
 test('replacement cannot spend an inactive, used or unfinalized activation',()=>{
  const r={version:1,components:[damageRollComponent({key:'base',source:'base',label:'Psychic',damageType:'psychic',expression:'1d6',rolls:[3],modifier:0,rawTotal:3})]};
  const base={active:true,usedThisTurn:false,recordedNumber:8};
  for(const patch of [{active:false},{usedThisTurn:true},{usedThisTurn:null},{recordedNumber:null},{recordedNumber:37}])expect(()=>sql(`select dndkeep_private.preview_pending_typed_replacement(${encoded(r)},${encoded(target())},'{}',${encoded({...base,...patch})},'{"componentKey":"base","dieIndex":0}')`)).toThrow(/available Sharpened/);
 });
 test('fixed maxima and unrelated dice cannot be substituted',()=>{
  for(const kind of ['maximum','unknown','adjusted'] as const){
   const r={version:1,components:[damageRollComponent({key:'base',source:'base',label:'Psychic',damageType:'psychic',expression:'1d6',rolls:[3],dieKinds:[kind],modifier:0,rawTotal:3})]};
   expect(()=>sql(`select dndkeep_private.preview_pending_typed_replacement(${encoded(r)},${encoded(target())},'{}','{"active":true,"usedThisTurn":false,"recordedNumber":8}','{"componentKey":"base","dieIndex":0}')`)).toThrow(/cannot be replaced/);
   expect(()=>sql(`select dndkeep_private.preview_pending_typed_replacement(${encoded(r)},${encoded(target())},'{}','{"active":true,"usedThisTurn":false,"recordedNumber":8}','{"componentKey":"elsewhere","dieIndex":0}')`)).toThrow(/this damage packet/);
  }
 });
 test('a Psychic-immune target cannot enable a physical-die replacement',()=>{
  const r={version:1,components:[damageRollComponent({key:'base',source:'base',label:'Blade',damageType:'slashing',expression:'1d8',rolls:[2],modifier:0,rawTotal:2}),damageRollComponent({key:'rider:psychic',source:'rider',label:'Psychic',damageType:'psychic',expression:'1d6',rolls:[3],modifier:0,rawTotal:3})]};
  expect(()=>sql(`select dndkeep_private.preview_pending_typed_replacement(${encoded(r)},${encoded(target({...none,immune:['psychic']}))},'{}','{"active":true,"usedThisTurn":false,"recordedNumber":8}','{"componentKey":"base","dieIndex":0}')`)).toThrow(/must take Psychic damage/);
 });
 test('clients cannot call the unfinished private calculator',()=>{
  expect(sql(`select has_function_privilege('anon','dndkeep_private.resolve_pending_typed_damage(jsonb,jsonb,jsonb,jsonb)','execute') or has_function_privilege('authenticated','dndkeep_private.resolve_pending_typed_damage(jsonb,jsonb,jsonb,jsonb)','execute')`)).toBe('f');
  expect(sql(`select has_function_privilege('anon','dndkeep_private.preview_pending_typed_replacement(jsonb,jsonb,jsonb,jsonb,jsonb)','execute') or has_function_privilege('authenticated','dndkeep_private.preview_pending_typed_replacement(jsonb,jsonb,jsonb,jsonb,jsonb)','execute')`)).toBe('f');
 });
});
