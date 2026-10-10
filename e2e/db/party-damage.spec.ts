import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.use({serviceWorkers:'block'});
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('party damage affinity order',()=>{
 gateDbSuite();
 for(const {recovery,legacy,saveEffects,stony} of [{recovery:false,legacy:false,saveEffects:false,stony:false},{recovery:true,legacy:false,saveEffects:false,stony:false},{recovery:false,legacy:true,saveEffects:false,stony:false},{recovery:true,legacy:false,saveEffects:true,stony:false},{recovery:true,legacy:false,saveEffects:false,stony:true}]) test(stony?'Stony resistance previews correctly and a lost receipt survives expiry':saveEffects?'campaign save modifiers survive a lost damage response':legacy?'chosen Tiefling legacy changes preview and applied HP':recovery?'lost damage response survives reload without applying twice':'odd damage applies resistance before vulnerability in preview and HP',async({page},info)=>{
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
   if(saveEffects)sql(`update characters set constitution=14,saving_throw_proficiencies=array['constitution'],concentration_spell='detect-magic',nat_1_20_saves=false,exhaustion_level=2,
    inventory='[{"magic_item_id":"ring-protection","name":"Ring of Protection","magical":true,"equipped":true,"attuned":true,"saveBonus":1}]',
    active_buffs='[{"name":"Bless","saveBonus":0},{"name":"Bane"},{"name":"Ward","saveBonus":2}]' where id='${character}'`);
   if(legacy)sql(`update characters set species='Tiefling',species_choices='{"tieflingLegacy":"abyssal"}' where id='${character}'`);
   if(stony)sql(`update characters set class_name='Psion',subclass='Metamorph',level=10,class_resources='{"psionic-energy-dice":8}',damage_resistances=array[]::text[],damage_vulnerabilities=array[]::text[] where id='${character}';
    begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';
    select dndkeep_private.begin_mutable_form('${character}','${randomUUID()}',dndkeep_private.action_turn_context('${character}')->>'turnId',2,false,'{"kind":"stony","resistance":"Fire"}');commit;`);
   const final=legacy||stony?11:22,hp=50-final,label=legacy||stony?'resistant':'resistance then vulnerability';
   await signInAsSeedDm(page,email);await page.goto('/campaigns/'+campaign);
   await page.getByRole('button',{name:'Party',exact:true}).click();await page.getByRole('button',{name:'AoE Damage',exact:true}).click();
   const panel=page.getByRole('region',{name:'Party area damage'});
   await panel.getByRole('button',{name:/Affinity Fixture/}).click();
   await panel.getByPlaceholder('Damage amount…').fill('23');
   await panel.getByTitle('Damage type — untyped ignores resistance/vulnerability').selectOption(stony?'fire':legacy?'poison':'psychic');
   await expect(panel).toContainText(`Affinity Fixture takes ${final}`);await expect(panel).toContainText(`(50→${hp})`);await expect(panel).toContainText(label);
   await panel.getByText(`Affinity Fixture takes ${final}`,{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('damage-preview.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');
    const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Party area damage\"], [aria-label=\"Party area damage\"] *')");
    const layout=await page.evaluate('('+scoped+'\n})()');await info.attach('damage-layout',{body:JSON.stringify(layout),contentType:'application/json'});expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);
   }
   if(recovery)await page.route('**/rest/v1/rpc/apply_party_damage',async route=>{
    const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');
   });
   if(saveEffects)await page.evaluate(()=>{Math.random=()=>.25;});
   await panel.getByRole('button',{name:'Apply to 1 target',exact:true}).click();
   await expect.poll(()=>sql(`select current_hp from characters where id='${character}'`)).toBe(String(hp));
   if(recovery){
    await expect(panel).toContainText('Some results need confirmation');
    if(saveEffects){
     const saved=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.startsWith('dndkeep:party-damage:'))![1]).requests[0]);
     expect(saved.effectRolls.map((r:{total:number})=>r.total)).toEqual([2,-2,2]);expect(saved.baseModifier).toBe(3);expect(saved.modifier).toBe(5);
     expect(sql(`select con_bonus from pending_concentration_saves where character_id='${character}'`)).toBe('4');
     sql(`update characters set exhaustion_level=0,active_buffs='[]' where id='${character}'`);
    }
    if(stony){
     expect(sql(`select damage_resistances::text from characters where id='${character}'`)).toBe('{}');
     sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+600 where character_id='${character}'`);
    }
    await page.unroute('**/rest/v1/rpc/apply_party_damage');await page.reload();
    await page.getByRole('button',{name:'Party',exact:true}).click();await page.getByRole('button',{name:'AoE Damage',exact:true}).click();
    await expect(panel).toContainText('Saved damage needs confirmation');
    await panel.getByRole('button',{name:'Confirm saved damage',exact:true}).click();
    await expect(panel).toContainText('Party damage confirmed.');
    expect(sql(`select current_hp from characters where id='${character}'`)).toBe(String(hp));
    expect(sql(`select count(*) from dndkeep_private.party_damage_events where character_id='${character}'`)).toBe('1');
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('dndkeep:party-damage:')))).toEqual([]);
   }
   if(saveEffects){
    const pendingId=sql(`select id from pending_concentration_saves where character_id='${character}'`);
    const receipt=await page.evaluate(async({character,pendingId})=>{Math.random=()=>.25;const path='/src/lib/api/concentrationSaves.ts',api=await import(path);return api.resolveConcentrationSave(character,pendingId,'player');},{character,pendingId});
    expect(receipt).toMatchObject({outcome:'failed',total:10});
   }
   await expect(panel).toContainText(label);
   await page.screenshot({path:info.outputPath('damage-applied.png')});
  }finally{sql(`delete from characters where id='${character}';delete from campaigns where id='${campaign}';delete from auth.users where id='${user}';`);}
 });
});
