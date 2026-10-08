import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.use({serviceWorkers:'block'});
test.describe('Creature damage defense preservation',()=>{
 gateDbSuite();
 test('catalog import and creature editor preserve defenses and conditional wording',async({page},info)=>{
  const campaign=randomUUID(),name='Defense fixture '+campaign.slice(0,8),owner=randomUUID(),email='defense-'+owner+'@dndkeep.local';
  const catalog={id:'defense-'+campaign,damage_resistances:['psychic'],damage_immunities:['poison'],damage_vulnerabilities:['fire']};
  try{
   sql(`    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
    values('00000000-0000-0000-0000-000000000000','${owner}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Damage Fixture"}',now(),now(),'','','','');
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),'${owner}','${owner}','{"sub":"${owner}","email":"${email}"}','email',now(),now(),now());
insert into monsters(id,name,source,owner_id,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,damage_resistances,damage_immunities,damage_vulnerabilities) values('${catalog.id}','Defense test','homebrew','${owner}','construct','1',200,'Medium',20,'3d8',12,30,10,10,10,10,10,10,array['psychic'],array['poison'],array['fire']);insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Creature defenses')`);
   await signInAsSeedDm(page,email);
   const created=await page.evaluate(async input=>{const path='/src/lib/api/creatures.ts';return (await import(path)).importFromCatalog({catalogMonsterId:input.id,campaignId:input.campaign,nameOverride:input.name});},{id:catalog.id,campaign,name});
   for(const key of ['damage_resistances','damage_immunities','damage_vulnerabilities'])expect(created[key]).toEqual(catalog[key]??[]);
   await page.goto('/campaigns/'+campaign);await page.getByRole('button',{name:'NPCs',exact:true}).first().click();
   await page.getByRole('button',{name:'Spawn Pool',exact:true}).click();await page.getByText(name,{exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Creature editor'});
   const resistance=dialog.getByRole('textbox',{name:/^Resistances/});
   await expect(resistance).toHaveValue((catalog.damage_resistances??[]).join('\n'));
   await resistance.fill('psychic\nbludgeoning, piercing, and slashing from nonmagical attacks');
   await dialog.getByRole('textbox',{name:/^Immunities/}).fill('poison');
   await dialog.getByRole('textbox',{name:/^Vulnerabilities/}).fill('fire');
   await resistance.scrollIntoViewIfNeeded();await dialog.screenshot({path:info.outputPath('creature-defenses.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Creature editor\"], [aria-label=\"Creature editor\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
   await dialog.getByRole('button',{name:'Save Changes'}).click();await expect(dialog).toBeHidden();
   const saved=JSON.parse(sql(`select jsonb_build_object('r',damage_resistances,'i',damage_immunities,'v',damage_vulnerabilities) from homebrew_monsters where id='${created.id}'`));
   expect(saved).toEqual({r:['psychic','bludgeoning, piercing, and slashing from nonmagical attacks'],i:['poison'],v:['fire']});
   await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(resistance).toHaveValue(saved.r.join('\n'));
   await dialog.getByRole('button',{name:'Save Changes'}).click({trial:true});
  }finally{await page.close();sql(`delete from homebrew_monsters where campaign_id='${campaign}';delete from campaigns where id='${campaign}';delete from monsters where id='${catalog.id}';delete from auth.users where id='${owner}'`);}
 });
});
