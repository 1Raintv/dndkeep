import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion magic item ability effects', () => {
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

  for(const secondary of [false,true])test(`canonical Headband survives inventory cache load (${secondary?'secondary':'primary'} Psion)`,async({page},info)=>{
    const inventory=[{id:randomUUID(),name:'Headband of Intellect',quantity:1,weight:0,description:'',equipped:true,magical:true,attuned:true,magic_item_id:'headband-of-intellect'}];
    sql(`update characters set class_name='${secondary?'Fighter':'Psion'}',level=${secondary?3:5},secondary_class='${secondary?'Psion':'Fighter'}',secondary_level=${secondary?5:3},secondary_subclass='${secondary?'Telepath':'Champion'}',subclass='${secondary?'Champion':'Telepath'}',intelligence=10,temp_hp=0,inventory='${JSON.stringify(inventory)}',class_resources='{"psion-disciplines":["Biofeedback"],"psionic-energy-dice":6}' where id='${charId}'`);
    // Supply the public catalogue response only; do not change shared canonical
    // local rows. All character payments still use the real disposable DB row.
    let loaded=false;
    await page.route('**/rest/v1/magic_items?*',async route=>{
      const response=await route.fetch(),rows=await response.json();
      await route.fulfill({response,json:[...rows.filter((row:{id:string})=>row.id!=='headband-of-intellect'),{id:'headband-of-intellect',owner_id:null,source:'srd',name:'Headband of Intellect',item_type:'wondrous',rarity:'uncommon',requires_attunement:true,description:'Intelligence 19 while worn and attuned.',weight:0,ac_bonus:null,save_bonus:null,attack_bonus:null,damage_bonus:null,max_charges:null,recharge:null,recharge_dice:null,base_damage_dice:null}]});loaded=true;
    });
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{Math.random=()=>0.01;});await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Inventory$/}).click();await expect.poll(()=>loaded).toBe(true);
    await page.getByRole('button',{name:'Actions',exact:true}).click();
    await page.getByRole('button',{name:'Free 5 ft',exact:true}).locator('visible=true').first().click();
    const propel=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});await expect(propel).toContainText('DC 15 Strength');
    await propel.getByRole('button',{name:'Save passed',exact:true}).click();
    const activate=page.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first();
    await activate.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await activate.click();
    const dialog=page.getByRole('dialog',{name:'Biofeedback',exact:true});await expect(dialog).toContainText('Choose 1–4 Energy Dice');
    await page.screenshot({path:info.outputPath('headband-biofeedback.png')});await dialog.getByRole('textbox').fill('1');
    await dialog.getByRole('button',{name:'Spend and roll'}).click();
    await expect.poll(()=>sql(`select temp_hp||':'||(class_resources->>'psionic-energy-dice') from characters where id='${charId}'`)).toBe('5:5');
    expect(errors).toEqual([]);
  });
});
