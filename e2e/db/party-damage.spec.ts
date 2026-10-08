import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.use({serviceWorkers:'block'});
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('party damage affinity order',()=>{
 gateDbSuite();
 for(const recovery of [false,true]) test(recovery?'lost damage response survives reload without applying twice':'odd damage applies resistance before vulnerability in preview and HP',async({page},info)=>{
  const user=randomUUID(),character=randomUUID(),campaign=randomUUID(),email='damage-'+user+'@dndkeep.local';
  try{
   sql(`begin;
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
    values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Damage Fixture"}',now(),now(),'','','','');
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
    insert into campaigns(id,owner_id,name) values('${campaign}','${user}','Damage fixture');
    insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp,temp_hp,damage_resistances,damage_vulnerabilities)
    values('${character}','${user}','${campaign}','Affinity Fixture','Human','Fighter','Soldier',5,50,50,0,array['psychic'],array['psychic']);commit;`);
   await signInAsSeedDm(page,email);await page.goto('/campaigns/'+campaign);
   await page.getByRole('button',{name:'Party',exact:true}).click();await page.getByRole('button',{name:'AoE Damage',exact:true}).click();
   const panel=page.getByRole('region',{name:'Party area damage'});
   await panel.getByRole('button',{name:/Affinity Fixture/}).click();
   await panel.getByPlaceholder('Damage amount…').fill('23');
   await panel.getByTitle('Damage type — untyped ignores resistance/vulnerability').selectOption('psychic');
   await expect(panel).toContainText('Affinity Fixture takes 22');await expect(panel).toContainText('(50→28)');await expect(panel).toContainText('resistance then vulnerability');
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('damage-preview.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');
    const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Party area damage\"], [aria-label=\"Party area damage\"] *')");
    const layout=await page.evaluate('('+scoped+'\n})()');await info.attach('damage-layout',{body:JSON.stringify(layout),contentType:'application/json'});expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);
   }
   if(recovery)await page.route('**/rest/v1/rpc/apply_party_damage',async route=>{
    const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');
   });
   await panel.getByRole('button',{name:'Apply to 1 target',exact:true}).click();
   await expect.poll(()=>sql(`select current_hp from characters where id='${character}'`)).toBe('28');
   if(recovery){
    await expect(panel).toContainText('Some results need confirmation');
    await page.unroute('**/rest/v1/rpc/apply_party_damage');await page.reload();
    await page.getByRole('button',{name:'Party',exact:true}).click();await page.getByRole('button',{name:'AoE Damage',exact:true}).click();
    await expect(panel).toContainText('Saved damage needs confirmation');
    await panel.getByRole('button',{name:'Confirm saved damage',exact:true}).click();
    await expect(panel).toContainText('Party damage confirmed.');
    expect(sql(`select current_hp from characters where id='${character}'`)).toBe('28');
    expect(sql(`select count(*) from dndkeep_private.party_damage_events where character_id='${character}'`)).toBe('1');
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('dndkeep:party-damage:')))).toEqual([]);
   }
   await expect(panel).toContainText('resistance then vulnerability');
   await page.screenshot({path:info.outputPath('damage-applied.png')});
  }finally{sql(`delete from characters where id='${character}';delete from campaigns where id='${campaign}';delete from auth.users where id='${user}';`);}
 });
});
