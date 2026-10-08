import {execFileSync} from 'node:child_process';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
import {removeConditions} from '../../src/rules/conditionRemoval';
const sql=(query:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const json=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
test.describe('Condition removal database parity',()=>{
 gateDbSuite();
 test('every subset of incapacitating parents agrees with client rules, including simultaneous removal',()=>{
  const parents=['Unconscious','Paralyzed','Stunned','Petrified'];
  const cases=[];
  for(let mask=1;mask<16;mask++){
   const active=parents.filter((_,i)=>mask&(1<<i));
   for(let removal=1;removal<(1<<active.length);removal++){
    const conditions=[...active,'Prone','Incapacitated','Poisoned'];
    const sources={Prone:{source:active.includes('Unconscious')?'cascade:Unconscious':'manual'},Incapacitated:{source:`cascade:${active[0]}`},Poisoned:{source:'other'}};
    const requested=active.filter((_,i)=>removal&(1<<i));
    cases.push({conditions,sources,requested});
   }
  }
  for(const source of ['manual','cascade:Unconscious'])for(const requested of [['Prone'],['Unconscious'],['Unconscious','Prone']])cases.push({conditions:['Unconscious','Prone','Incapacitated','Poisoned'],sources:{Prone:{source},Incapacitated:{source:'cascade:Unconscious'},Poisoned:{source:'other'}},requested});
  const results=JSON.parse(sql(`select jsonb_agg(dndkeep_private.remove_conditions(array(select jsonb_array_elements_text(c->'conditions')),c->'sources',array(select jsonb_array_elements_text(c->'requested')))) from jsonb_array_elements(${json(cases)}) c`));
  expect(results).toEqual(cases.map(c=>removeConditions(c.conditions,c.sources,c.requested)));
 });
 test('application roles cannot call the internal condition helper',()=>{
  for(const role of ['anon','authenticated'])expect(()=>sql(`set role ${role};select dndkeep_private.remove_conditions(array['Unconscious'],'{}',array['Unconscious']);`)).toThrow(/permission denied/);
 });
});
