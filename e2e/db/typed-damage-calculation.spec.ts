import {execFileSync} from 'node:child_process';
import {expect,test} from '@playwright/test';
import {resolveTypedDamage,type TypedDamageDefenses,type TypedDamageAdjustment} from '../../src/rules/typedDamage';
import {damageRollComponent,type DamageComponentRecord} from '../../src/rules/damageComponents';
import {DAMAGE_TYPES} from '../../src/rules/damageAffinities';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const packet=(entries:[string|null,number][]):DamageComponentRecord=>({version:1,components:entries.map(([type,n],i)=>damageRollComponent({key:i?'rider:'+i:'base',source:i?'rider':'base',label:'Damage',damageType:type,expression:String(n),rolls:[],modifier:n,rawTotal:n}))});
const none:TypedDamageDefenses={immune:[],resistant:[],vulnerable:[]};
const inactive={active:false,sources:{}};
const calculate=(p:unknown,d:unknown=none,a:unknown={},s:unknown=inactive)=>JSON.parse(sql(`select dndkeep_private.resolve_typed_damage_components(${literal(p)},${literal(d)},${literal(a)},${literal(s)})`));
test.describe('Private typed damage calculation',()=>{
 gateDbSuite();
 for(const type of DAMAGE_TYPES)for(const mode of ['resistant','immune','vulnerable','both'] as const)test(`${type}: ${mode} rounds once per type`,()=>{
  const p=packet([[type,5],[type,4],['untyped',3]]),d={...none,
   resistant:mode==='resistant'||mode==='both'?[type]:[],immune:mode==='immune'?[type]:[],vulnerable:mode==='vulnerable'||mode==='both'?[type]:[]};
  const result=calculate(p,d);expect(result).toEqual(resolveTypedDamage(p,d));
  expect(result.total).toBe((mode==='resistant'?4:mode==='immune'?0:mode==='vulnerable'?18:8)+3);
 });
 const cases:{name:string;entries:[string|null,number][];defenses:TypedDamageDefenses;adjustments?:TypedDamageAdjustment;sharpened?:Parameters<typeof resolveTypedDamage>[3];total:number}[]=[
  {name:'Stony fire never halves psychic base',entries:[['psychic',7],['fire',5]],defenses:{...none,resistant:['fire']},total:9},
  {name:'save half precedes resistance and vulnerability',entries:[['fire',47]],defenses:{...none,resistant:['fire'],vulnerable:['fire']},adjustments:{multiplier:.5},total:22},
  {name:'duplicate blanket resistance applies once',entries:[['fire',9]],defenses:{...none,resistant:['FIRE'],resistanceAll:true},adjustments:{resistantTypes:['fire']},total:4},
  {name:'untyped blanket resistance',entries:[[null,5]],defenses:{...none,resistanceAll:true},total:2},
  {name:'Sharpened bypass respects source and type',entries:[['psychic',5],['psychic',3],['fire',7]],defenses:{...none,resistant:['psychic','fire']},sharpened:{active:true,sources:{base:'psion-spell','rider:1':'other','rider:2':'psion-feature'}},total:9},
  {name:'immunity prevents bypass',entries:[['psychic',5],['psychic',3]],defenses:{...none,resistant:['psychic'],immune:['psychic']},adjustments:{multiplier:.5},sharpened:{active:true,sources:{base:'psion-spell'}},total:0},
  {name:'no resistance means one save rounding',entries:[['psychic',5],['psychic',3]],defenses:none,adjustments:{multiplier:.5},sharpened:{active:true,sources:{base:'psion-spell','rider:1':'other'}},total:4},
  {name:'successful save prevents all damage',entries:[['fire',9]],defenses:{...none,vulnerable:['fire']},adjustments:{multiplier:0},total:0},
  {name:'negative components combine before clamping',entries:[['fire',-3],['fire',7]],defenses:{...none,resistant:['fire']},total:2},
 ];
 for(const c of cases)test(c.name,()=>{const p=packet(c.entries),r=calculate(p,c.defenses,c.adjustments??{},c.sharpened??inactive);expect(r).toEqual(resolveTypedDamage(p,c.defenses,c.adjustments,c.sharpened));expect(r.total).toBe(c.total);});
 test('mixed bypass/resistance half allocation is rejected on both sides',()=>{
  const p=packet([['psychic',5],['psychic',3]]),d={...none,resistant:['psychic']},a={multiplier:.5 as const},s={active:true,sources:{base:'psion-spell' as const,'rider:1':'other' as const}};
  expect(()=>calculate(p,d,a,s)).toThrow(/explicit adjustment allocation/);expect(()=>resolveTypedDamage(p,d,a,s)).toThrow(/explicit adjustment allocation/);
 });
 test('unknown defenses cannot silently become normal damage',()=>{
  for(const value of [null,['fire from spells'],['unknown'],[4]])expect(()=>calculate(packet([['fire',9]]),{...none,resistant:value})).toThrow();
 });
 test('malformed recorded evidence is refused',()=>{
  for(const patch of [{rawTotal:10},{rolls:[1],dieKinds:[]},{damageType:'unknown'},{rawTotal:null},{modifier:0.5},{source:'made-up'},{key:''}]){
   const p=packet([['fire',9]]);Object.assign(p.components[0],patch);expect(()=>calculate(p)).toThrow();
  }
  const p=packet([['fire',9]]);p.components.push({...p.components[0]});expect(()=>calculate(p)).toThrow();
 });
 test('unsafe totals and vulnerability multiplication fail instead of rounding',()=>{
  expect(()=>calculate(packet([['fire',Number.MAX_SAFE_INTEGER],['fire',1]]))).toThrow(/supported number range/);
  expect(()=>calculate(packet([['fire',Number.MAX_SAFE_INTEGER]]),{...none,vulnerable:['fire']})).toThrow(/supported number range/);
 });
 test('calculation is immutable and inaccessible to browser roles',()=>{
  expect(sql("select provolatile from pg_proc where oid='dndkeep_private.resolve_typed_damage_components(jsonb,jsonb,jsonb,jsonb)'::regprocedure")).toBe('i');
  for(const role of ['anon','authenticated'])expect(sql(`select has_function_privilege('${role}','dndkeep_private.resolve_typed_damage_components(jsonb,jsonb,jsonb,jsonb)','execute')`)).toBe('f');
 });
});
