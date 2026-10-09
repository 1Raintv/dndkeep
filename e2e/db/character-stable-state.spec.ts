import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Character stable state',()=>{
 gateDbSuite();let owner:string,id:string,campaign:string;
 test.beforeEach(()=>{
  [owner,id,campaign]=Array.from({length:3},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@stable.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Stable tests');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${id}','${owner}','${campaign}','Dying','Human','Fighter','Sage',1,0,10);`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${id}';delete from auth.users where id='${owner}';`));
 const update=(set:string)=>sql(`update characters set ${set} where id='${id}'`);
 const state=()=>JSON.parse(sql(`select json_build_array(current_hp,is_stable,death_saves_successes,death_saves_failures) from characters where id='${id}'`));
 const stabilize=()=>update('death_saves_successes=3,death_saves_failures=2');
 test('legacy third success becomes stable with both counters reset',()=>{stabilize();expect(state()).toEqual([0,true,0,0]);});
 test('healing clears stable and counters',()=>{stabilize();update('current_hp=1');expect(state()).toEqual([1,false,0,0]);});
 test('damage failures end stable',()=>{stabilize();update('death_saves_failures=1');expect(state()).toEqual([0,false,0,1]);});
 test('damage absorbed by temporary HP still ends stable at zero HP',()=>{stabilize();update('temp_hp=5');update('temp_hp=4');expect(state()).toEqual([0,false,0,0]);});
 test('unrelated edits preserve stable',()=>{stabilize();update("name='Still stable'");expect(state()).toEqual([0,true,0,0]);});
 test('manual reset ends stable without healing',()=>{stabilize();update('is_stable=false');expect(state()).toEqual([0,false,0,0]);});
 test('new combatant inherits stable or dying counters',()=>{
  stabilize();const cb=randomUUID();
  sql(`insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${cb}','${campaign}','${owner}','Stable','character','${id}',0,10)`);
  expect(sql(`select is_stable::text||':'||death_save_successes||':'||death_save_failures from combatants where id='${cb}'`)).toBe('true:0:0');
 });
});
