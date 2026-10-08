import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

const docker=process.platform==='win32'?`${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe`:'docker';
const sql=(q:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111',player='12121212-1212-1212-1212-121212121212';

test.describe('confirmed attack declarations (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 test('a lost response retries one saved attack and displays recovery',async({page},info)=>{
  test.setTimeout(90_000);
  const camp=randomUUID(),scene=randomUUID(),enc=randomUUID(),hero=randomUUID(),target=randomUUID();
  try {
      sql(`begin;
        alter table campaigns disable trigger check_campaign_pro_gate;
        insert into campaigns(id,owner_id,name) values('${camp}','${dm}','Target Loading Fixture');
        alter table campaigns enable trigger check_campaign_pro_gate;
        insert into campaign_members(campaign_id,user_id,role) values('${camp}','${player}','player');
        alter table characters disable trigger check_character_limit;
        insert into characters(id,user_id,campaign_id,name,species,class_name,background,weapons) values
          ('${hero}','${player}','${camp}','Targeting Hero','Human','Fighter','Soldier','[{"id":"sword","name":"Fixture Sword","attackBonus":5,"damageDice":"1d8","damageBonus":3,"damageType":"slashing","range":"60","properties":""}]'),
          ('${target}','${dm}','${camp}','Far Target','Human','Fighter','Soldier','[]');
        alter table characters enable trigger check_character_limit;
        insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
          values('${scene}','${camp}','${dm}','Range Arena','square',70,15,12,'bright',true);
        insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all) values
          ('${randomUUID()}','${scene}','${hero}','Targeting Hero','medium',35,35,true),
          ('${randomUUID()}','${scene}','${target}','Far Target','medium',105,35,true);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,combatant_id)
          select '${enc}','${camp}','character',c.definition_id::uuid,c.name,case when c.definition_id='${hero}' then 0 else 1 end,10,c.id
          from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}';
        commit;`);

   const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
   await signInAsSeedDm(page,'test-player@dndkeep.local');await page.goto(`/character/${hero}`);
   await page.getByRole('button',{name:'Actions',exact:true}).locator('visible=true').first().click();
   const requests:string[]=[];let lose=true;
   await page.route('**/rest/v1/pending_attacks?**',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    requests.push(route.request().postDataJSON().id);
    if(lose){lose=false;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');}
    else await route.continue();
   });
   await page.getByTitle('Attack a target with Fixture Sword — runs full combat resolution',{exact:true}).click();
   await page.getByRole('button',{name:/Far Target/}).click();
   const alert=page.getByRole('alert').filter({hasText:'Attack declaration not confirmed'});
   await expect(alert).toBeVisible();await alert.scrollIntoViewIfNeeded();
   const retry=page.getByRole('button',{name:'Retry declaration',exact:true});
   for(const element of [alert,retry]){const box=await element.boundingBox();expect(box).toBeTruthy();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);}
   await page.screenshot({path:info.outputPath('attack-declaration-retry.png')});
   await page.getByRole('button',{name:'Retry declaration',exact:true}).click();
   await expect(alert).toHaveCount(0);
   await expect.poll(()=>sql(`select state from pending_attacks where encounter_id='${enc}'`)).toBe('attack_rolled');
   expect(requests).toHaveLength(2);expect(requests[0]).toBeTruthy();expect(requests[1]).toBe(requests[0]);
   expect(sql(`select count(*) from pending_attacks where encounter_id='${enc}'`)).toBe('1');expect(errors).toEqual([]);
  }finally{
   await page.unroute('**/rest/v1/pending_attacks?**');
   sql(`delete from pending_attacks where encounter_id='${enc}';delete from combat_participants where encounter_id='${enc}';delete from combat_encounters where id='${enc}';
    delete from scenes where id='${scene}';delete from combatants where campaign_id='${camp}';
    delete from characters where id in ('${hero}','${target}');delete from campaign_members where campaign_id='${camp}';delete from campaigns where id='${camp}';`);
  }
 });
});
