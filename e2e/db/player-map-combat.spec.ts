import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const docker=process.platform==='win32' ? `${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe` : 'docker';
const sql=(query:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111', player='12121212-1212-1212-1212-121212121212';

test.describe('player map combat (local stack)',()=>{
  gateDbSuite();
  test('ownership, turn order and remaining movement survive real player drags',async({page:peer,browser},info)=>{
    test.setTimeout(90_000);
    const camp=randomUUID(), scene=randomUUID(), enc=randomUUID(), own=randomUUID(), other=randomUUID();
    let ownToken=randomUUID(), otherToken=randomUUID();
    const name=`E2E Movement ${info.project.name} ${camp.slice(0,8)}`;
    const peerContext=await browser.newContext();const page=await peerContext.newPage();
    const errors:string[]=[];peer.on('pageerror',e=>errors.push(String(e)));
    try {
      // Dedicated campaign: never alter the user's working scene or encounter.
      // The character cap is suspended only inside this local fixture transaction.
      sql(`begin;
        alter table campaigns disable trigger check_campaign_pro_gate;
        insert into campaigns(id,owner_id,name) values('${camp}','${dm}','${name}');
        alter table campaigns enable trigger check_campaign_pro_gate;
        insert into campaign_members(campaign_id,user_id,role) values('${camp}','${player}','player');
        alter table characters disable trigger check_character_limit;
        insert into characters(id,user_id,campaign_id,name,species,class_name,background,speed) values
          ('${own}','${player}','${camp}','Movement Player','Human','Fighter','Soldier',5),
          ('${other}','${dm}','${camp}','Movement Other','Human','Fighter','Soldier',30);
        alter table characters enable trigger check_character_limit;
        insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
          values('${scene}','${camp}','${dm}','Movement Arena','square',70,15,12,'bright',true);
        insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all) values
          ('${ownToken}','${scene}','${own}','Movement Player','medium',245,245,true),
          ('${otherToken}','${scene}','${other}','Movement Other','medium',455,245,true);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,max_speed_ft,combatant_id)
          select '${enc}','${camp}','character','${other}','Movement Other',0,20,30,combatant_id from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}' and c.definition_id='${other}';
        insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,max_speed_ft,combatant_id)
          select '${enc}','${camp}','character','${own}','Movement Player',1,10,5,combatant_id from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}' and c.definition_id='${own}';
        commit;`);
      ownToken=sql(`select p.id from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}' and c.definition_id='${own}';`);
      otherToken=sql(`select p.id from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}' and c.definition_id='${other}';`);
      expect(sql(`select count(*) from combat_participants where encounter_id='${enc}';`)).toBe('2');
      // Real database roles: all probes roll back, leaving the browser fixture
      // untouched. No admin client or ownership rewrite stands in for a player.
      const asUser=(statement:string,user=player,before='',role='authenticated')=>sql(`begin; ${before}
        set local role ${role}; set local request.jwt.claim.sub='${user}'; ${statement}; rollback;`);
      const changed=(statement:string)=>`with changed as (${statement} returning id) select count(*) from changed`;
      const move=`update scene_token_placements set x=x+1 where id='${ownToken}'`;
      expect(asUser(changed(move))).toBe('1');
      expect(asUser(changed(`update scene_token_placements set x=x+1 where id='${otherToken}'`))).toBe('0');
      expect(asUser(changed(move),randomUUID())).toBe('0');
      expect(()=>asUser(changed(move),'','','anon')).toThrow(/permission denied/);
      for(const before of [
        `delete from campaign_members where campaign_id='${camp}' and user_id='${player}';`,
        `update scenes set is_published=false where id='${scene}';`,
        `update scene_token_placements set visible_to_all=false where id='${ownToken}';`,
        `update characters set campaign_id=null where id='${own}';`,
        `update combatants set definition_type='custom' where campaign_id='${camp}' and definition_id='${own}';`,
      ]) expect(asUser(changed(move),player,before)).toBe('0');
      for(const patch of ["rotation=90","visible_to_all=false","light_radius_ft=60",
        `id='${randomUUID()}'`,`scene_id='${randomUUID()}'`,
        `combatant_id=(select combatant_id from scene_token_placements where id='${otherToken}')`]) {
        expect(()=>asUser(`update scene_token_placements set ${patch} where id='${ownToken}'`)).toThrow(/Players may only move/);
      }
      expect(asUser(changed(`delete from scene_token_placements where id='${ownToken}'`))).toBe('0');
      expect(asUser(changed(`update combatants set owner_id='${player}' where campaign_id='${camp}' and definition_id='${own}'`))).toBe('0');
      expect(()=>asUser(`insert into scene_token_placements(scene_id,combatant_id) select scene_id,combatant_id from scene_token_placements where id='${ownToken}'`)).toThrow(/row-level security/);
      expect(asUser(changed(`update scene_token_placements set rotation=90 where id='${ownToken}'`),dm)).toBe('1');
      const open=async(p:Page,email?:string)=>{
        await signInAsSeedDm(p,email);await p.goto('/campaigns');
        await p.getByText(name,{exact:true}).locator('visible=true').first().click();
        if(email) await p.getByRole('button',{name:'Battle Map',exact:true}).click();
        await expect(p.locator('canvas').first()).toBeVisible({timeout:30_000});
        await p.getByTitle('Fullscreen map',{exact:true}).click();
        await p.getByRole('button',{name:'Fit map',exact:true}).click();
        const fullscreen=await p.locator('.battle-map-fullscreen').boundingBox();
        expect(fullscreen!.y).toBe(0);expect(fullscreen!.x).toBe(0);
        const nav=await p.getByRole('toolbar',{name:'Map navigation'}).boundingBox();
        const strip=await p.locator('.initiative-strip').boundingBox();
        expect(nav!.y+nav!.height).toBeLessThanOrEqual(strip!.y-8);
        for(const title of ['Dice Roller','Roll Log']) {
          const fab=await p.getByTitle(title,{exact:true}).boundingBox();
          expect(nav!.y+nav!.height).toBeLessThanOrEqual(fab!.y-8);
        }
      };
      await open(page);await open(peer,'test-player@dndkeep.local');
      const position=(id:string)=>sql(`select x||','||y from scene_token_placements where id='${id}';`);
      const drag=async(id:string)=>{
        await expect.poll(()=>peer.evaluate(id=>{
          const vp=(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins);
          return !!vp?.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
        },id)).toBe(true);
        const point=await peer.evaluate(id=>{
          const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
          const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
          const p=t.getGlobalPosition();return {x:p.x,y:p.y,step:70*vp.scale.x};
        },id);
        const box=(await peer.locator('canvas').first().boundingBox())!;
        await peer.mouse.move(box.x+point.x,box.y+point.y);await peer.mouse.down();
        await peer.mouse.move(box.x+point.x,box.y+point.y+point.step,{steps:6});await peer.mouse.up();
      };
      const writes:string[]=[];
      peer.on('request',r=>{if(r.method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url())) writes.push(r.url());});
      await drag(otherToken);await drag(ownToken);
      expect(writes).toHaveLength(0);
      expect(position(otherToken)).toBe('455,245');expect(position(ownToken)).toBe('245,245');
      await page.getByRole('button',{name:'End Turn',exact:true}).click();
      await expect(peer.getByTitle('0 / 5 ft used this turn — 5 ft remaining',{exact:true})).toBeVisible();
      // v2.723 — hold a real player's click-save pending; another click and a
      // drag must share its reservation. Reject it without spending movement.
      const clickCell=async(x:number,y:number)=>{
        const p=await peer.evaluate(({x,y})=>{
          const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
          const point=vp.toScreen(x,y),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:point.x+r.x,y:point.y+r.y};
        },{x,y});await peer.mouse.click(p.x,p.y);
      };
      let release!:()=>void;const pending=new Promise<void>(r=>release=r);let clickWrites=0;
      const pattern='**/rest/v1/scene_token_placements?**';
      await peer.route(pattern,async route=>{
        if(route.request().method()==='PATCH'){clickWrites++;await pending;await route.fulfill({status:200,contentType:'application/json',body:'[]'});}else await route.continue();
      });
      try {
        await clickCell(245,315);await expect.poll(()=>clickWrites).toBe(1);
        await clickCell(315,315);
        await expect(peer.getByText('This token is moving or saving. Please wait.',{exact:true})).toBeVisible();
        await drag(ownToken);await expect(peer.getByText('Saving this token’s move. Please wait.',{exact:true})).toBeVisible();
        expect(clickWrites).toBe(1);release();
        await expect(peer.getByText('Move could not be saved. Your token was returned and no movement was spent.',{exact:true})).toBeVisible();
        await expect.poll(()=>peer.evaluate(async id=>{const p='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ p);return useBattleMapStore.getState().tokens[id].y;},ownToken)).toBe(245);
        expect(position(ownToken)).toBe('245,245');
        expect(sql(`select movement_used_ft from combat_participants where encounter_id='${enc}' and entity_id='${own}';`)).toBe('0');
      }finally{release();await peer.unroute(pattern);}
      const clickNotices=peer.getByRole('button',{name:'Dismiss',exact:true});
      while(await clickNotices.count())await clickNotices.first().click();
      // Retain the failed-save rollback regression with one simulated zero-row
      // response. The subsequent successful drag goes to the real database.
      await peer.route('**/rest/v1/scene_token_placements?**',async route=>{
        if(route.request().method()==='PATCH') {
          await route.fulfill({status:200,contentType:'application/json',body:'[]'});
          await peer.unroute('**/rest/v1/scene_token_placements?**');
        } else await route.continue();
      });
      await drag(ownToken);
      await expect(peer.getByText('Move could not be saved. Your token was returned and no movement was spent.',{exact:true})).toBeVisible();
      await expect.poll(()=>peer.evaluate(async(id)=>{const p='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ p);const t=useBattleMapStore.getState().tokens[id];return t.y;},ownToken)).toBe(245);
      expect(position(ownToken)).toBe('245,245');
      expect(sql(`select movement_used_ft from combat_participants where encounter_id='${enc}' and entity_id='${own}';`)).toBe('0');
      expect(sql(`select owner_id from combatants where campaign_id='${camp}' and definition_id='${own}';`)).toBe(dm);
      await drag(ownToken);
      await expect.poll(()=>position(ownToken)).toBe('245,315');
      await expect.poll(()=>sql(`select movement_used_ft from combat_participants where encounter_id='${enc}' and entity_id='${own}';`)).toBe('5');
      await expect(peer.getByTitle('5 / 5 ft used this turn — 0 ft remaining',{exact:true})).toBeVisible();
      const saved=writes.length;
      await drag(ownToken);
      expect(position(ownToken)).toBe('245,315');expect(writes).toHaveLength(saved);
      expect(errors).toEqual([]);
      const dismiss=peer.getByRole('button',{name:'Dismiss',exact:true});
      while(await dismiss.count()) await dismiss.first().click();
      await peer.screenshot({path:info.outputPath('player-movement.png')});
      await peer.setViewportSize({width:851,height:393});
      await peer.getByLabel('Map controls',{exact:true}).click();
      const help=await peer.getByRole('region',{name:'Map controls help'}).boundingBox();
      expect(help!.y).toBeGreaterThanOrEqual(8);
      expect(help!.y+help!.height).toBeLessThanOrEqual(393);
      await peer.screenshot({path:info.outputPath('landscape-help.png')});
      await peer.getByRole('region',{name:'Map controls help'}).locator('dd').last().scrollIntoViewIfNeeded();
      const lastHint=await peer.getByRole('region',{name:'Map controls help'}).locator('dd').last().boundingBox();
      expect(lastHint!.y).toBeGreaterThanOrEqual(help!.y);
      expect(lastHint!.y+lastHint!.height).toBeLessThanOrEqual(help!.y+help!.height);
    } finally {
      await peerContext.close().catch(()=>{});
      sql(`delete from combat_participants where encounter_id='${enc}'; delete from combat_encounters where id='${enc}';
        delete from scenes where id='${scene}'; delete from combatants where campaign_id='${camp}';
        delete from characters where id in ('${own}','${other}'); delete from campaign_members where campaign_id='${camp}'; delete from campaigns where id='${camp}';`);
    }
  });
});
