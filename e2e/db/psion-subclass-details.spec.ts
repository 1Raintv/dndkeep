import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Revised Psion subclass references', () => {
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

  test('expanded subclass features include the missing costs and successful-save details',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);
    for(const [subclass,header,detail] of [
      ['Metamorph','Extra Attack & Flesh Weaver','Each use of this healing bonus costs its own die'],
      ['Psykinetic','Destructive Trance & Rebounding Field','on a successful save, deal half as much damage'],
      ['Telepath','Telepath Spells & Mind Infiltrator & Telepathic Distraction','it does not waive the spell-slot cost'],
    ]) {
      sql(`update characters set subclass='${subclass}' where id='${charId}'`);
      await page.goto(`/character/${charId}`);await page.reload();
      await page.locator('button.tab').filter({hasText:/^Features$/}).click();
      await page.getByText(header,{exact:true}).click();
      const text=page.getByText(detail,{exact:false}).locator('visible=true').first();
      await expect(text).toBeVisible();await text.scrollIntoViewIfNeeded();
      await page.screenshot({path:info.outputPath(subclass.toLowerCase()+'.png')});
    }
    expect(errors).toEqual([]);
  });
  test('weapon header follows class levels and Metamorph eligibility',async({page},info)=>{
    await signInAsSeedDm(page,email);
    for(const [className,level,subclass,count] of [
      ['Psion',5,'Metamorph',1],
      ['Psion',6,'Metamorph',2],
      ['Psion',20,'Telepath',1],
      ['Fighter',11,'Champion',3],
      ['Fighter',20,'Champion',4],
    ] as const) {
      sql(`update characters set class_name='${className}',level=${level},subclass='${subclass}' where id='${charId}'`);
      await page.goto(`/character/${charId}`);await page.reload();
      const countLabel=page.getByText(`Attacks per Action: ${count}`,{exact:true});
      await expect(countLabel).toBeVisible({timeout:20_000});
      if(className==='Psion' && level===6) {
        await countLabel.evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));
        await page.screenshot({path:info.outputPath('metamorph-attacks.png')});
      }
    }
  });

});
