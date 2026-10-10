import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.use({serviceWorkers:'block'});
test.describe('Manual weapon ability modifier',()=>{
 gateDbSuite();
 test('persists reviewed modifiers without copying generated attacks',async({page},info)=>{
 const id=randomUUID(),user=randomUUID(),email=`manual-${user}@dndkeep.local`;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 try{
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
   insert into characters(id,user_id,name,species,class_name,background,level,current_hp,max_hp,death_saves_successes)
   values('${id}','${user}','Manual weapon fixture','Human','Fighter','Sage',1,10,10,0);commit;`);
 await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
 await page.getByRole('button',{name:'Actions',exact:true}).click();
 await page.getByRole('button',{name:'Add Custom Attack',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Add Custom Attack',exact:true});
 await modal.getByLabel('Name *',{exact:true}).fill('Greatsword');
 await modal.getByLabel('Attack Bonus (d20 +)',{exact:true}).fill('9');
 await modal.getByLabel('Damage Bonus',{exact:true}).fill('6');
 const ability=modal.getByLabel('Attack ability modifier (optional)',{exact:true});
 await ability.fill('1.5');await expect(modal.getByRole('button',{name:'Add Attack',exact:true})).toBeDisabled();
 await ability.fill('4');
 await page.screenshot({path:`.tmp/manual-weapon-${info.project.name}.png`});
 if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
 await modal.getByRole('button',{name:'Add Attack',exact:true}).click();
 const saved=()=>JSON.parse(sql(`select weapons from characters where id='${id}'`));
 await expect.poll(saved).toEqual([expect.objectContaining({name:'Greatsword',attackBonus:9,damageBonus:6,attackAbilityModifier:4})]);
 for(const value of ['0','-2','']){
  await page.reload();await page.getByRole('button',{name:'Actions',exact:true}).click();
  await page.getByRole('button',{name:'Edit Greatsword',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit Attack'});
  await edit.getByLabel('Attack ability modifier (optional)',{exact:true}).fill(value);
  await edit.getByRole('button',{name:'Save Changes'}).click();
  await expect.poll(()=>saved()[0]?.attackAbilityModifier??null).toBe(value===''?null:Number(value));
  expect(saved()).toHaveLength(1);expect(saved()[0]).toMatchObject({attackBonus:9,damageBonus:6});
 }
 await page.reload();await page.getByRole('button',{name:'Actions',exact:true}).click();
 await page.getByRole('button',{name:'Edit Greatsword',exact:true}).click();
 await expect(page.getByLabel('Attack ability modifier (optional)',{exact:true})).toHaveValue('');
 expect(errors).toEqual([]);
 }finally{await page.close().catch(()=>{});sql(`delete from characters where id='${id}';delete from auth.users where id='${user}';`);}
 });
});
