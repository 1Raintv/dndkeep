import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const docker=process.platform==='win32'?`${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe`:'docker';
const sql=(q:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Higher slots without scaling (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 test('Psion chooses and pays a remaining higher slot for Detect Magic',async({page},info)=>{
  test.setTimeout(90_000);const hero=randomUUID(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  try{
   sql(`begin;alter table characters disable trigger check_character_limit;
    insert into characters(id,user_id,name,species,class_name,background,level,intelligence,current_hp,max_hp,known_spells,prepared_spells,spell_sources,spell_preparation_sources,spell_slots)
    values('${hero}','12121212-1212-1212-1212-121212121212','Higher Slot Psion','Human','Psion','Sage',5,18,30,30,ARRAY['detect-magic'],ARRAY['detect-magic'],'{"detect-magic":["class:Psion"]}','{"detect-magic":["class:Psion"]}','{"1":{"total":4,"used":4},"2":{"total":3,"used":3},"3":{"total":2,"used":0}}');
    alter table characters enable trigger check_character_limit;commit;`);
   await signInAsSeedDm(page,'test-player@dndkeep.local');await page.goto(`/character/${hero}`);
   await page.locator('button.tab').filter({hasText:/^Spells/}).click();
   // Start failure capture after navigation, which cancels the home page's reads.
   page.on('requestfailed',r=>errors.push(`${r.failure()?.errorText} ${r.url()}`));
   await page.getByTitle('Detect Magic',{exact:true}).click({timeout:15000});
   await page.getByRole('button',{name:/Upcast at higher slot/}).click();
   const modal=page.locator('.modal').filter({has:page.getByRole('heading',{name:'Detect Magic',exact:true})});
   await expect(modal).toContainText('A higher slot is allowed');
   await expect(modal.getByRole('button',{name:/Upcast at Level 3/})).toBeVisible();
   expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('0');
   await modal.getByRole('button',{name:'Cancel',exact:true}).click();
   expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('0');
   await page.getByRole('button',{name:/Upcast at higher slot/}).click();
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.modal, .modal *')");const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
   await page.screenshot({path:info.outputPath('higher-slot-picker.png')});
   await modal.getByRole('button',{name:/Upcast at Level 3/}).click();
   await expect.poll(()=>sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');
   await expect.poll(()=>sql(`select concentration_spell from characters where id='${hero}'`)).toBe('detect-magic');
   expect(sql(`select spell_slots->'1'->>'used' from characters where id='${hero}'`)).toBe('4');
   expect(sql(`select spell_slots->'2'->>'used' from characters where id='${hero}'`)).toBe('3');
   expect(errors).toEqual([]);
  }finally{sql(`delete from characters where id='${hero}'`);}
 });
});
