import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('saved attack outcome rules',()=>{
 gateDbSuite();
 let owner:string,camp:string,email:string;
 test.beforeEach(()=>{
  owner=randomUUID();camp=randomUUID();email=`attack-outcome-${owner}@dndkeep.local`;
  sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${owner}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),'{}',now(),now(),'','','','');`);
  sql(`insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${email}'),'email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Attack outcome fixture');`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${camp}';delete from auth.users where id='${owner}'`);});
 test('live attack recording preserves cover, natural extremes and the selected house rule',async({page})=>{
  await signInAsSeedDm(page,email);
  const cases=[{die:20,bonus:-10,ac:30,cover:'none',nat1:true,result:'crit'},
   {die:20,bonus:0,ac:10,cover:'total',nat1:true,result:'miss'},
   {die:1,bonus:20,ac:10,cover:'none',nat1:true,result:'fumble'},
   {die:1,bonus:20,ac:10,cover:'none',nat1:false,result:'hit'},
   {die:10,bonus:5,ac:13,cover:'half',nat1:true,result:'hit'},
   {die:10,bonus:4,ac:13,cover:'half',nat1:true,result:'miss'}];
  for(const entry of cases){
   const id=randomUUID();
   sql(`insert into pending_attacks(id,campaign_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,cover_level,chain_id)
    values('${id}','${camp}','Fixture attacker','system','Fixture target','object','Fixture strike','attack_roll',${entry.bonus},${entry.ac},'${entry.cover}','${randomUUID()}')`);
   const result=await page.evaluate(async({id,die,nat1})=>{
    const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');
    localStorage.setItem('dndkeep:houseRules',JSON.stringify({nat1AutoFails:nat1}));
    const random=Math.random;Math.random=()=> (die-0.5)/20;
    try{return await rollAttackRoll(id);}finally{Math.random=random;}
   },{id,die:entry.die,nat1:entry.nat1});
   expect(result).toMatchObject({state:'attack_rolled',attack_d20:entry.die,attack_total:entry.die+entry.bonus,hit_result:entry.result,target_ac:entry.ac+(entry.cover==='half'?2:0)});
   expect(JSON.parse(sql(`select jsonb_build_object('hit',hit_result,'total',attack_total) from pending_attacks where id='${id}'`))).toEqual({hit:entry.result,total:entry.die+entry.bonus});
  }
 });
});
