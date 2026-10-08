import {assertFloatingToolsClear} from '../floating-tools';
import {readFileSync} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion Destructive Thoughts', () => {
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
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Psi Warper',20,'{"psion-disciplines":["Destructive Thoughts"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });


  test('tabletop damage pays chosen dice once and retains the result',async({page},info)=>{
    await page.addInitScript(()=>{Math.random=()=>0.01;});
    sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["Destructive Thoughts"],"psionic-energy-dice":6,"other":9}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await assertFloatingToolsClear(page,false);
    const navigation=page.getByRole('navigation',{name:'Character navigation'});
    await navigation.getByRole('button',{name:'Join Campaign',exact:true}).click();
    const invite=navigation.getByRole('textbox',{name:'Campaign invite code'});await expect(invite).toBeVisible();
    await page.screenshot({path:info.outputPath('character-join-navigation.png')});await invite.press('Escape');
    await expect(navigation.getByRole('button',{name:'Join Campaign',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Roll damage',exact:true}).locator('visible=true').first().click();
    const target=page.getByRole('dialog',{name:'Destructive Thoughts target'});
    await target.getByRole('textbox').fill('Tabletop Goblin');await target.getByRole('button',{name:'Choose target'}).click();
    const cost=page.getByRole('dialog',{name:'Destructive Thoughts',exact:true});
    await expect(cost).toContainText('Conjuration or Evocation');await cost.getByRole('textbox').fill('3');
    await page.screenshot({path:info.outputPath('destructive-cost.png')});
    await cost.getByRole('button',{name:'Spend and roll'}).click();
    await expect(page.getByRole('status').filter({hasText:'7 Psychic ·'})).toContainText('Apply at the table');
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('3');
    await expect.poll(()=>sql(`select total from action_logs where character_id='${charId}' and action_name='Destructive Thoughts'`)).toBe('7');
    expect(sql(`select class_resources->>'other' from characters where id='${charId}'`)).toBe('9');
    await page.getByRole('status').filter({hasText:'7 Psychic ·'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('destructive-tabletop.png')});
  });

  for(const level of [7,20])test(`player ${level} queues paid enhanced damage once after a lost response; DM applies it`,async({page,browser},info)=>{
    test.setTimeout(90_000);const amount=level===20?20:12,spent=level===20?3:1;
    const dm=randomUUID(),camp=randomUUID(),enc=randomUUID(),self=randomUUID(),target=randomUUID(),hidden=randomUUID(),cbSelf=randomUUID(),cbTarget=randomUUID(),cbHidden=randomUUID();
    const dmEmail=`psion-dm-${dm}@dndkeep.local`,campName=`Destructive Thoughts in the Kingdom of the Very Long Campaign Name ${camp.slice(0,8)}`;
    const dmContext=await browser.newContext({serviceWorkers:'block'});
    try{
      sql(`begin;
        insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
        values ('00000000-0000-0000-0000-000000000000','${dm}','authenticated','authenticated','${dmEmail}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Damage DM"}',now(),now(),'','','','');
        insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
        values (gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dmEmail}"}','email',now(),now(),now());
        insert into campaigns(id,owner_id,name) values('${camp}','${dm}','${campName}');
        insert into campaign_members(campaign_id,user_id,role) values('${camp}','${userId}','player');
        update characters set campaign_id='${camp}',level=${level},intelligence=18,hit_dice_spent=0,class_resources='{"psion-disciplines":["Destructive Thoughts"],"psionic-energy-dice":2,"other":9}' where id='${charId}';
        insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values
          ('${cbSelf}','${camp}','${userId}','Restoration Fixture','character','${charId}',30,30),
          ('${cbTarget}','${camp}','${dm}','Visible Goblin','custom','fixture-goblin',30,30),
          ('${cbHidden}','${camp}','${dm}','Secret Assassin','custom','fixture-assassin',30,30);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,combatant_id,hidden_from_players) values
          ('${self}','${enc}','${camp}','character','${charId}','Restoration Fixture',0,20,'${cbSelf}',false),
          ('${target}','${enc}','${camp}','creature','fixture-goblin','Visible Goblin',1,10,'${cbTarget}',false),
          ('${hidden}','${enc}','${camp}','creature','fixture-assassin','Secret Assassin',2,5,'${cbHidden}',true);
        commit;`);
      const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{Math.random=()=>0.01;});
      await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
      const mapLink=page.getByRole('button',{name:'Battle Map',exact:true});
      await expect(mapLink).toBeVisible();
      await expect.poll(()=>mapLink.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      const navigation=page.getByRole('navigation',{name:'Character navigation'});
      await expect.poll(()=>navigation.evaluate(el=>Array.from(el.querySelectorAll('button')).every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>0;}))).toBe(true);
      await expect.poll(()=>navigation.getByRole('button',{name:'Characters',exact:true}).evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      if(page.viewportSize()!.width>=1100)await expect.poll(()=>navigation.evaluate(el=>{const map=el.querySelector('.character-map-button')!.getBoundingClientRect(),sync=el.querySelector('.character-sync-status')!.getBoundingClientRect();return Math.abs(map.top+map.height/2-sync.top-sync.height/2);})).toBeLessThanOrEqual(1);
      await assertFloatingToolsClear(page,true,name=>info.outputPath(name));
      await page.screenshot({path:info.outputPath('character-navigation.png')});
      await page.screenshot({path:info.outputPath('combat-tools-clearance.png')});
      const originalViewport=page.viewportSize()!;await page.setViewportSize({width:650,height:450});await assertFloatingToolsClear(page,true);await page.setViewportSize(originalViewport);await assertFloatingToolsClear(page,true);
      await page.getByRole('button',{name:'Roll damage',exact:true}).locator('visible=true').first().click();
      await expect(page.getByRole('heading',{name:'Destructive Thoughts target'})).toBeVisible();
      await expect(page.getByText('Secret Assassin',{exact:true})).toHaveCount(0);
      await page.screenshot({path:info.outputPath('destructive-targets.png')});
      await page.getByRole('button').filter({hasText:'Visible Goblin'}).click();
      const cost=page.getByRole('dialog',{name:'Destructive Thoughts',exact:true});
      await cost.getByRole('textbox').fill('2');await cost.getByRole('button',{name:'Spend and roll'}).click();
      let posts=0;
      await page.route('**/rest/v1/rpc/queue_destructive_thoughts_effect',async route=>{
        if(route.request().method()==='POST'){
          posts++;if(posts===1){const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();}else await route.continue();
        }else await route.continue();
      });
      let finalizationAttempts=0;
      if(level===7)await page.route('**/rest/v1/rpc/finalize_psionic_effect_roll',async route=>{finalizationAttempts++;await route.abort();});
      if(level===20){await expect(page.getByRole('dialog',{name:'Enkindled Life Force'})).toBeVisible();await page.reload();await page.getByRole('button',{name:/Resume paid roll/}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('destructive-resume.png')});await page.getByRole('button',{name:/Resume paid roll/}).click();const extra=page.getByRole('dialog',{name:'Enkindled Life Force'});await extra.getByRole('textbox').fill('2');await extra.getByRole('button',{name:'Continue'}).click();}
      await page.getByRole('button',{name:'Spend 1 Hit Point Die',exact:true}).click();
      if(level===7){await expect.poll(()=>finalizationAttempts).toBe(2);await page.unroute('**/rest/v1/rpc/finalize_psionic_effect_roll');await page.reload();await page.getByRole('button',{name:/Resume paid roll/}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('destructive-resume.png')});await page.getByRole('button',{name:/Resume paid roll/}).click();}
      await expect(page.getByRole('button',{name:'Retry queue',exact:true})).toBeVisible();
      await expect(page.getByRole('status').filter({hasText:`${amount} Psychic ·`})).toContainText('Not queued');
      await page.reload();
      await expect(page.getByRole('status').filter({hasText:`${amount} Psychic ·`})).toContainText('Not queued');
      await page.getByRole('button',{name:'Retry queue',exact:true}).click();
      await expect(page.getByRole('status').filter({hasText:`${amount} Psychic ·`})).toContainText('Queued in combat');
      expect(posts).toBe(2);
      expect(sql(`select count(*) from pending_attacks where campaign_id='${camp}'`)).toBe('1');
      expect(JSON.parse(sql(`select json_build_object('dice',damage_dice,'type',damage_type,'kind',attack_kind,'target',target_participant_id) from pending_attacks where campaign_id='${camp}'`))).toEqual({dice:String(amount),type:'Psychic',kind:'auto_hit',target});
      const resources=()=>JSON.parse(sql(`select json_build_object('pool',class_resources->'psionic-energy-dice','spent',hit_dice_spent,'other',class_resources->'other') from characters where id='${charId}'`));
      await expect.poll(resources).toEqual({pool:0,spent,other:9});
      await page.getByRole('status').filter({hasText:`${amount} Psychic ·`}).scrollIntoViewIfNeeded();
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Psychic damage recovery\"], [aria-label=\"Psychic damage recovery\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
      await page.screenshot({path:info.outputPath('destructive-queued.png')});
      const dmPage=await dmContext.newPage();dmPage.on('pageerror',e=>errors.push(e.message));
      await signInAsSeedDm(dmPage,dmEmail);await dmPage.goto('/campaigns');
      await dmPage.getByText(campName,{exact:true}).locator('visible=true').first().click();
      await dmPage.getByRole('button',{name:/Roll Damage/}).click();
      await expect(dmPage.getByRole('button',{name:/Apply Damage/})).toBeVisible();
      // These are explicit custom fixtures, not nonexistent catalog monsters.
      await expect(dmPage.getByRole('region',{name:'Psychic damage resolution'})).toContainText('conditional or missing defenses');
      await dmPage.getByRole('combobox',{name:'Psychic defenses'}).selectOption('normal');
      await expect(dmPage.getByRole('button',{name:/Apply Damage/})).toBeEnabled();
      await dmPage.screenshot({path:info.outputPath('destructive-resolve.png')});
      await dmPage.getByRole('button',{name:/Apply Damage/}).click();
      await expect.poll(()=>sql(`select current_hp from combatants where id='${cbTarget}'`)).toBe(String(30-amount));
      expect(resources()).toEqual({pool:0,spent,other:9});expect(errors).toEqual([]);
    }finally{
      await dmContext.close();
      sql(`delete from campaigns where id='${camp}'; delete from auth.users where id='${dm}';`);
    }
  });
});
