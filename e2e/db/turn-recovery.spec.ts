import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Character sheet turn recovery', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.747: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      update profiles set show_ua_content=true where id='${userId}';
      insert into characters (id,user_id,name,species,class_name,background,subclass,level,class_resources)
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Psi Warper',20,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });



  test('failed combat advance keeps spent trackers; a confirmed retry resets them',async({page},info)=>{
    test.setTimeout(90_000);
    const camp=randomUUID(),enc=randomUUID(),self=randomUUID(),target=randomUUID(),cbSelf=randomUUID(),cbTarget=randomUUID();
    try{
      sql(`begin;
        insert into campaigns(id,owner_id,name) values('${camp}','${userId}','Turn recovery fixture');
        update characters set campaign_id='${camp}' where id='${charId}';
        insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values
          ('${cbSelf}','${camp}','${userId}','Restoration Fixture','character','${charId}',30,30),
          ('${cbTarget}','${camp}','${userId}','Turn Goblin','srd_monster','fixture-goblin',30,30);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,combatant_id,hidden_from_players) values
          ('${self}','${enc}','${camp}','character','${charId}','Restoration Fixture',0,20,'${cbSelf}',false),
          ('${target}','${enc}','${camp}','creature','fixture-goblin','Turn Goblin',1,10,'${cbTarget}',false);
        commit;`);
      const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
      const end=page.getByRole('button',{name:/End Turn →/});await expect(end).toBeVisible();
      await page.getByRole('button',{name:'Action Available',exact:true}).click();
      await expect(page.getByRole('button',{name:'Action Used',exact:true})).toBeVisible();
      let blocked=0;
      await page.route('**/rest/v1/combat_encounters*',async route=>{
        const url=new URL(route.request().url());
        if(route.request().method()==='GET'&&url.searchParams.get('id')===`eq.${enc}`&&url.searchParams.get('select')==='*'){
          blocked++;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Turn recovery fixture unavailable',code:'XX000'})});
        }else await route.continue();
      });
      await end.click();
      await expect(page.getByText(/Your sheet trackers were kept/)).toBeVisible();
      expect(blocked).toBeGreaterThan(0);expect(sql(`select current_turn_index from combat_encounters where id='${enc}'`)).toBe('0');
      await expect(page.getByRole('button',{name:'Action Used',exact:true})).toBeVisible();await expect(end).toBeEnabled();
      await end.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      await page.screenshot({path:info.outputPath('failed-turn-keeps-action.png')});
      await page.unroute('**/rest/v1/combat_encounters*');await end.click();
      await expect.poll(()=>sql(`select current_turn_index from combat_encounters where id='${enc}'`)).toBe('1');
      await expect(page.getByRole('button',{name:'Action Available',exact:true})).toBeVisible();expect(errors).toEqual([]);
    }finally{sql(`delete from campaigns where id='${camp}';`);}
  });
});
