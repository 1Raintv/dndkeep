import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

const docker=process.platform==='win32'?`${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe`:'docker';
const sql=(q:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111',player='12121212-1212-1212-1212-121212121212';

test.describe('target distance loading (local stack)',()=>{
  gateDbSuite();
  test.use({serviceWorkers:'block'}); // Route delays must reach the browser, not a local SW cache.
  test('weapon targets stay blocked while loading or offline and recover without an automatic attack',async({page},info)=>{
    test.setTimeout(90_000);
    const camp=randomUUID(),scene=randomUUID(),enc=randomUUID(),hero=randomUUID(),target=randomUUID();
    let release=()=>{};
    try {
      sql(`begin;
        alter table campaigns disable trigger check_campaign_pro_gate;
        insert into campaigns(id,owner_id,name) values('${camp}','${dm}','Target Loading Fixture');
        alter table campaigns enable trigger check_campaign_pro_gate;
        insert into campaign_members(campaign_id,user_id,role) values('${camp}','${player}','player');
        alter table characters disable trigger check_character_limit;
        insert into characters(id,user_id,campaign_id,name,species,class_name,background,weapons) values
          ('${hero}','${player}','${camp}','Targeting Hero','Human','Fighter','Soldier','[{"id":"sword","name":"Fixture Sword","attackBonus":5,"damageDice":"1d8","damageBonus":3,"damageType":"slashing","range":"Melee","properties":""}]'),
          ('${target}','${dm}','${camp}','Far Target','Human','Fighter','Soldier','[]');
        alter table characters enable trigger check_character_limit;
        insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
          values('${scene}','${camp}','${dm}','Range Arena','square',70,15,12,'bright',true);
        insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all) values
          ('${randomUUID()}','${scene}','${hero}','Targeting Hero','medium',35,35,true),
          ('${randomUUID()}','${scene}','${target}','Far Target','medium',595,35,true);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,combatant_id)
          select '${enc}','${camp}','character',c.definition_id::uuid,c.name,case when c.definition_id='${hero}' then 0 else 1 end,10,c.id
          from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}';
        commit;`);
      const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
      await signInAsSeedDm(page,'test-player@dndkeep.local');await page.goto(`/character/${hero}`);
      await page.getByRole('button',{name:'Actions',exact:true}).locator('visible=true').first().click();
      const attack=page.getByTitle('Attack a target with Fixture Sword — runs full combat resolution',{exact:true});
      await expect(attack).toBeVisible();
      let mode:'hold'|'error'|'real'='hold',reads=0,attacks=0;
      const waiting=new Promise<void>(r=>{release=r;});
      page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/pending_attacks'))attacks++;});
      await page.route('**/rest/v1/scenes?**',async route=>{
        reads++;
        if(mode==='hold')await waiting;
        if(mode==='error')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Offline fixture'})});
        else await route.continue();
      });
      await attack.click();await expect.poll(()=>reads).toBeGreaterThan(0);
      const row=page.getByRole('button',{name:/Far Target/});
      await expect(page.getByRole('status').filter({hasText:'Checking target distances'})).toBeVisible();
      await expect(row).toBeDisabled();expect(attacks).toBe(0);
      await page.screenshot({path:info.outputPath('target-loading.png')});
      mode='real';release();await expect(row).toContainText('40 ft — out of range');await expect(row).toBeDisabled();
      await page.getByRole('button',{name:'Close target picker',exact:true}).click();
      mode='error';await attack.click();
      await expect(page.getByRole('alert')).toContainText('Could not check target distances',{timeout:20_000});await expect(row).toBeDisabled();
      await page.screenshot({path:info.outputPath('target-offline.png')});
      mode='real';await page.getByRole('button',{name:'Try again',exact:true}).click();
      await expect(row).toContainText('40 ft — out of range');await expect(row).toBeDisabled();
      await expect(page.getByRole('alert')).toHaveCount(0);expect(attacks).toBe(0);expect(errors).toEqual([]);
    }finally{
      release();await page.unroute('**/rest/v1/scenes?**');
      sql(`delete from combat_participants where encounter_id='${enc}';delete from combat_encounters where id='${enc}';
        delete from scenes where id='${scene}';delete from combatants where campaign_id='${camp}';
        delete from characters where id in ('${hero}','${target}');delete from campaign_members where campaign_id='${camp}';delete from campaigns where id='${camp}';`);
    }
  });
});
