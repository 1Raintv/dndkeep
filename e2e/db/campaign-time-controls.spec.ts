import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.use({serviceWorkers:'block'});
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Campaign time recovery controls',()=>{
 gateDbSuite();
 for(const committed of [true,false])test(committed?'lost applied response survives reload without ticking twice':'empty campaign can cancel an unsent time advance',async({page},info)=>{
  const user=randomUUID(),character=randomUUID(),campaign=randomUUID(),email='clock-'+user+'@dndkeep.local';
  try{
   sql(`begin;
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
    values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Damage Fixture"}',now(),now(),'','','','');
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
    insert into campaigns(id,owner_id,name,seconds_per_round) values('${campaign}','${user}','Clock fixture',6);
    ${committed?`insert into characters(id,user_id,campaign_id,name,species,class_name,background,active_buffs) values('${character}','${user}','${campaign}','Clock hero','Human','Psion','Sage','[{"name":"Timed fixture","duration":20}]');`:''}commit;`);
   await signInAsSeedDm(page,email);await page.goto('/campaigns/'+campaign);await page.getByRole('button',{name:'Party',exact:true}).click();
   if(committed)await page.getByRole('button',{name:'Advance Time',exact:true}).click();
   const panel=page.getByRole('region',{name:'Campaign time'});await expect(panel.getByLabel('Campaign clock')).toContainText('0 rounds');
   await page.route('**/rest/v1/rpc/advance_campaign_time',async route=>{if(committed){const response=await route.fetch();expect(response.ok()).toBe(true);}await route.abort('failed');});
   await panel.getByRole('button',{name:'1 minute',exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();
   await page.reload();await page.getByRole('button',{name:'Party',exact:true}).click();if(committed)await page.getByRole('button',{name:'Advance Time',exact:true}).click();
   await expect(panel).toContainText('Saved time needs confirmation');await expect(panel.getByRole('button',{name:'1 minute',exact:true})).toBeDisabled();
   await panel.scrollIntoViewIfNeeded();await panel.screenshot({path:info.outputPath('saved-time.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Campaign time\"], [aria-label=\"Campaign time\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
   await page.unroute('**/rest/v1/rpc/advance_campaign_time');
   await panel.getByRole('button',{name:committed?'Confirm saved time':'Cancel unconfirmed time',exact:true}).click();
   await expect(panel).not.toContainText('Saved time needs confirmation');await expect(panel.getByLabel('Campaign clock')).toContainText(committed?'10 rounds':'0 rounds');
   // Trial click scrolls and verifies the bottom control is not obscured by fixed phone navigation.
   await panel.getByRole('button',{name:'24 hours',exact:true}).click({trial:true});
   expect(sql(`select combat_rounds_elapsed from campaigns where id='${campaign}'`)).toBe(committed?'10':'0');
   if(committed)expect(sql(`select active_buffs->0->>'duration' from characters where id='${character}'`)).toBe('10');
  }finally{await page.close();sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id='${user}';`);}
 });
});
