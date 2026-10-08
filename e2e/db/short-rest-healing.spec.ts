import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Short Rest healing (local stack)', () => {
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
      values ('${charId}','${userId}','Short Rest Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  for(const hp of [0,1])test(`Short Rest at ${hp} HP respects eligibility and per-die minimum`,async({page},info)=>{
    sql(`update characters set constitution=4,current_hp=${hp},max_hp=20,hit_dice_spent=0 where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first().click();
    const roll=page.getByRole('button',{name:'Roll Hit Dice (d6-3)',exact:true});
    if(hp===0){
      await expect(roll).toBeDisabled();expect(sql(`select hit_dice_spent from characters where id='${charId}'`)).toBe('0');
    }else{
      await page.getByPlaceholder('1',{exact:true}).fill('2');
      await page.evaluate(()=>{let n=0;Math.random=()=>n++===0?0.001:0.999;});
      await roll.click();
      await expect.poll(()=>sql(`select current_hp||','||hit_dice_spent from characters where id='${charId}'`)).toBe('5,2');
      await expect(page.getByText('+4 HP recovered this rest',{exact:true})).toBeVisible();
      await page.reload();await expect.poll(()=>sql(`select current_hp||','||hit_dice_spent from characters where id='${charId}'`)).toBe('5,2');
      await page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first().click();
    }
    await roll.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('short-rest-healing.png')});
    expect(errors).toEqual([]);
  });
});
