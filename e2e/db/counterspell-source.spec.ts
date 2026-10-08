import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

const docker=process.platform==='win32'?`${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe`:'docker';
const sql=(q:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111',player='12121212-1212-1212-1212-121212121212';

test.describe('Counterspell source choices (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 for(const loseResponse of [false,true])test(`reactor selects its source and links the cast${loseResponse?' after a lost response':''}`,async({page},info)=>{
  test.setTimeout(90_000);
  const camp=randomUUID(),scene=randomUUID(),enc=randomUUID(),hero=randomUUID(),target=randomUUID(),cast=randomUUID(),offer=randomUUID();
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

   sql(`update characters set class_name='Sorcerer',level=5,secondary_class='Psion',secondary_level=5,
     intelligence=18,charisma=20,known_spells=ARRAY['counterspell'],prepared_spells=ARRAY['counterspell'],
     spell_sources='{"counterspell":["class:Sorcerer","class:Psion"]}',
     spell_preparation_sources='{"counterspell":["class:Sorcerer","class:Psion"]}',
     spell_slots='{"3":{"total":2,"used":0},"5":{"total":1,"used":0}}' where id='${hero}';
     insert into pending_spell_casts(id,campaign_id,encounter_id,chain_id,caster_participant_id,caster_character_id,caster_name,spell_name,spell_level,expires_at)
       select '${cast}','${camp}','${enc}','${randomUUID()}',id,'${target}','Far Target','Wish',9,now()+interval '5 minutes'
       from combat_participants where encounter_id='${enc}' and entity_id='${target}';
     insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload)
       select '${offer}','${camp}',id,'Targeting Hero','character','counterspell','Counterspell','spell_declared',now()+interval '5 minutes',
         '{"spell_cast_id":"${cast}","caster_name":"Far Target","spell_name":"Wish","spell_level":9,"save_dc":19}'
       from combat_participants where encounter_id='${enc}' and entity_id='${hero}';`);
   const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
   await signInAsSeedDm(page,'test-player@dndkeep.local');await page.goto(`/character/${hero}`);
   const source=page.getByRole('combobox',{name:'Counterspell casting source'});
   const castButton=page.getByRole('button',{name:'↯ Cast Counterspell',exact:true});
   await expect(source).toBeVisible();await expect(castButton).toBeDisabled();
   await source.selectOption('Sorcerer');await expect(page.getByText('DC 17 CON save',{exact:true})).toBeVisible();
   await source.selectOption('Psion');await expect(page.getByText('DC 16 CON save',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:/^L5/}).click();
   await expect(page.getByText('DC 16 CON save',{exact:true})).toBeVisible();await expect(castButton).toBeEnabled();
   expect(sql(`select spell_slots->'5'->>'used' from characters where id='${hero}'`)).toBe('0');
   await page.screenshot({path:info.outputPath('counterspell-source.png')});
   const rpcBodies:string[]=[];
   if(loseResponse)await page.route('**/rest/v1/rpc/accept_counterspell_atomic',async route=>{
    rpcBodies.push(route.request().postData()??'');
    if(rpcBodies.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}
    else await route.continue();
   });
   await castButton.click();
   await expect.poll(()=>sql(`select save_dc from pending_attacks where campaign_id='${camp}' and attack_name like 'Counterspell%'`)).toBe('16');
   await expect.poll(()=>sql(`select spell_slots->'5'->>'used' from characters where id='${hero}'`)).toBe('1');
   expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('0');
   await expect.poll(()=>sql(`select state from pending_reactions where id='${offer}'`)).toBe('accepted');
   await expect.poll(()=>sql(`select state from pending_spell_casts where id='${cast}'`)).toBe('counterspell_offered');
   if(loseResponse){await expect.poll(()=>rpcBodies.length).toBe(2);expect(rpcBodies[1]).toBe(rpcBodies[0]);}
   expect(sql(`select count(*) from dndkeep_private.counterspell_acceptances where offer_id='${offer}'`)).toBe('1');
   expect(sql(`select count(*) from combat_events where campaign_id='${camp}' and event_type='reaction_used'`)).toBe('1');
   expect(errors).toEqual([]);
  }finally{
   sql(`delete from pending_reactions where campaign_id='${camp}';delete from pending_spell_casts where campaign_id='${camp}';delete from pending_attacks where campaign_id='${camp}';`);
      sql(`delete from combat_participants where encounter_id='${enc}';delete from combat_encounters where id='${enc}';
        delete from scenes where id='${scene}';delete from combatants where campaign_id='${camp}';
        delete from characters where id in ('${hero}','${target}');delete from campaign_members where campaign_id='${camp}';delete from campaigns where id='${camp}';`);

  }
 });
});
