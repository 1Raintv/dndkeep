import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.use({serviceWorkers:'block'});
test.describe('Graze combat flow',()=>{
 gateDbSuite();
 for(const use of [true,false])test(use?'final miss offers optional Graze and recovers a lost choice':'declining Graze applies no damage',async({page},info)=>{
  const [owner,camp,character,actor,target,enc,attack]=Array.from({length:7},()=>randomUUID()),email=`graze-${owner}@dndkeep.local`;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const consoleErrors:string[]=[],httpErrors:string[]=[];
  page.on('console',m=>{if(m.type()==='error'&&!(use&&m.text().includes('Failed to load resource: net::ERR_FAILED')))consoleErrors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)httpErrors.push(`${r.status()} ${r.url()}`);});
  try{
   sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
    values('00000000-0000-0000-0000-000000000000','${owner}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}','{"sub":"${owner}","email":"${email}"}','email',now(),now(),now());
    insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Graze flow');
    insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,weapon_masteries,current_hp,max_hp) values('${character}','${owner}','${camp}','Fighter','Human','Fighter','Soldier',5,array['Greatsword'],20,20);
    insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
     ('${actor}','${enc}','${camp}','character','${character}','Fighter',0),('${target}','${enc}','${camp}','creature','${target}','Target',1);
    update combatants set definition_type='custom',definition_id='${target}',current_hp=20,max_hp=20,temp_hp=3,
     stat_block_snapshot='{"damage_resistances":["slashing from nonmagical attacks"],"damage_immunities":[],"damage_vulnerabilities":[]}' where id=(select combatant_id from combat_participants where id='${target}')`);
   await signInAsSeedDm(page,email);
   const rolled=await page.evaluate(async p=>{
    const {declareAttack,rollAttackRoll}=await import('/src/lib/pendingAttack.ts');
    await declareAttack({requestId:p.attack,campaignId:p.camp,encounterId:p.enc,attackerParticipantId:p.actor,attackerName:'Fighter',attackerType:'character',targetParticipantId:p.target,targetName:'Target',targetType:'creature',attackName:'Greatsword',attackKind:'attack_roll',attackSource:'weapon',attackMode:'melee',attackBonus:7,attackAbilityModifier:4,targetAC:20,damageDice:'2d6+4',damageType:'slashing'});
    const random=Math.random;Math.random=()=>0.1;try{return await rollAttackRoll(p.attack);}finally{Math.random=random;}
   },{attack,camp,enc,actor,target});
   expect(rolled).toMatchObject({hit_result:'miss',graze_resolution_version:1,attack_ability_modifier:4});
   const pools=()=>sql(`select current_hp||'|'||temp_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`);
   expect(pools()).toBe('20|3');
   await page.goto('/campaigns/'+camp);const panel=page.getByRole('region',{name:'Resolve attack'});
   await expect(panel.getByRole('button',{name:'Use Graze'})).toBeEnabled();expect(pools()).toBe('20|3');
   if(use){
    // A changed final outcome removes/restores the choice without writing HP.
    sql(`update pending_attacks set hit_result='hit' where id='${attack}'`);await page.reload();
    await expect(panel.getByRole('button',{name:/Roll Damage/})).toBeVisible();await expect(panel.getByRole('button',{name:'Use Graze'})).toHaveCount(0);
    sql(`update pending_attacks set hit_result='miss' where id='${attack}'`);await page.reload();await expect(panel.getByRole('button',{name:'Use Graze'})).toBeEnabled();
   }
   await panel.screenshot({path:`.tmp/graze-choice-${info.project.name}.png`});
   let dropped=0;
   if(use)await page.route('**/rest/v1/rpc/record_graze_damage',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);dropped++;await route.abort('failed');});
   await panel.getByRole('button',{name:use?'Use Graze':'Decline Graze'}).click();
   const apply=panel.getByRole('button',{name:use?'Apply Graze':'Finish without damage'});await expect(apply).toBeEnabled();expect(pools()).toBe('20|3');
   if(use){expect(dropped).toBe(2);await page.unroute('**/rest/v1/rpc/record_graze_damage');
    await panel.getByLabel('Review conditional or unrecorded defenses').check();await panel.getByLabel('Resistant',{exact:true}).check();await panel.getByLabel('Reason for ruling').fill('Nonmagical weapon confirmed');
   }
   await panel.screenshot({path:`.tmp/graze-damage-${info.project.name}-${use}.png`});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Resolve attack\"], [aria-label=\"Resolve attack\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
   await apply.click();await expect(panel).toHaveCount(0);expect(pools()).toBe(use?'20|1':'20|3');
   expect(sql(`select count(*) from dndkeep_private.graze_damage_applications where attack_id='${attack}'`)).toBe('1');
   expect(sql(`select count(*) from combat_events where chain_id=(select chain_id from pending_attacks where id='${attack}') and event_type='damage_applied'`)).toBe('1');expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);expect(httpErrors).toEqual([]);
  }finally{await page.close().catch(()=>{});sql(`delete from campaigns where id='${camp}';delete from characters where id='${character}';delete from auth.users where id='${owner}'`);}
 });
});
