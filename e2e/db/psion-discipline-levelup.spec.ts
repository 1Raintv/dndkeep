import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion Discipline level-up', () => {
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

  for(const level of [1,4,5]) test(`level ${level+1} choices and single replacement`,async({page},info)=>{
    const originals=level===1?[]:level===4?['Biofeedback','Psionic Guards']:['Biofeedback','Psionic Guards','Inerrant Aim'];
    sql(`update characters set level=${level},pending_manual_level_grants=1,spell_slots='{"1":{"total":${level===1?2:4},"used":1}${level===1?'':',"2":{"total":3,"used":2}'}${level===5?',"3":{"total":2,"used":1}':''}}',class_resources='${JSON.stringify({'psion-disciplines':originals,'psionic-energy-dice':2,other:9})}' where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:/Level up available/}).click();
    const next=page.getByRole('button',{name:'Next →',exact:true});
    await next.click();await next.click();
    const search=page.getByPlaceholder('Search disciplines...');
    await expect(search).toBeVisible();
    async function toggle(name:string){await search.fill(name);await page.getByRole('button',{name:new RegExp(name)}).click();}
    if(level===1){
      await expect(next).toBeDisabled();await toggle('Biofeedback');await toggle('Inerrant Aim');
    }else{
      if(level===4)await toggle('Expanded Awareness');
      await toggle('Biofeedback');await toggle('Devilish Tongue');
      await expect(next).toBeEnabled();
      // Replacing a second pre-existing choice must not permit advancement.
      await toggle('Psionic Guards');await toggle('Observant Mind');await expect(next).toBeDisabled();
      await toggle('Observant Mind');await toggle('Psionic Guards');
    }
    await search.fill('');await expect(next).toBeEnabled();
    const bounds=(await page.getByRole('dialog',{name:'Level up',exact:true}).boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({path:info.outputPath('discipline-level-up.png')});
    await next.click();await page.getByRole('button',{name:'Confirm Level Up',exact:true}).click();
    await expect.poll(()=>sql(`select level from characters where id='${charId}'`)).toBe(String(level+1));
    const slots=JSON.parse(sql(`select spell_slots from characters where id='${charId}'`));
    expect(slots['1']).toEqual({total:level===1?3:4,used:1});
    if(level!==1){expect(slots['2']).toEqual({total:3,used:2});expect(slots['3']).toEqual({total:level===4?2:3,used:level===4?0:1});}
    const resources=JSON.parse(sql(`select class_resources from characters where id='${charId}'`));
    expect(resources.other).toBe(9);expect(resources['psionic-energy-dice']).toBe(2);
    expect(resources['psion-disciplines']).toHaveLength(level===1?2:3);
    expect(resources['psion-disciplines']).toContain(level===1?'biofeedback':'devilish-tongue');
    if(level!==1){expect(resources['psion-disciplines']).not.toContain('biofeedback');expect(resources['psion-disciplines']).toContain('psionic-guards');}
    await page.reload();expect(errors).toEqual([]);
  });
});
