import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Sharpened Mind damage resolution',()=>{
 gateDbSuite();let dm:string,player:string,campaign:string,char:string,cb:string,enc:string,cp:string,attack:string,activation:string;
 test.beforeEach(()=>{
  activation=randomUUID();
  [dm,player,campaign,char,cb,enc,cp,attack]=Array.from({length:8},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@ctx.local','{}'),('${player}','${player}@ctx.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Damage context');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,damage_resistances,level,intelligence,class_resources) values('${char}','${player}','${campaign}','Actor','Human','Psion','Sage',array['psychic'],20,18,'{"psionic-energy-dice":12,"psion-disciplines":["sharpened-mind"]}');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,stat_block_snapshot) values('${cb}','${campaign}','${player}','Actor','character','${char}',100,100,'{"damage_resistances":["fire"]}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${cp}','${enc}','${campaign}','character','${char}','Actor',0,'${cb}');
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id,damage_final,psionic_damage_dice) values('${attack}','${campaign}','${enc}','${cp}','${cp}','Actor','character','Target','Destructive Thoughts','auto_hit','melee','hit','damage_rolled','13','psychic','${randomUUID()}',13,'{"version":1,"sides":8,"originalRolls":[1,5,3],"rolls":[1,5,3],"modifier":4}');update combatants set temp_hp=3 where id='${cb}';update characters set current_hp=100,max_hp=100 where id='${char}';commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${dm}','${player}')`));
 const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
 const run=(q:string,u=dm)=>JSON.parse(sql(auth(u,q))||'null');
 const preview=(choice:unknown={},id=attack)=>run(`select preview_psionic_damage('${id}',${encoded(choice)})`);
 const apply=(plan=preview(),id=attack)=>run(`select apply_psionic_damage_resolution('${id}',${encoded(plan)},2)`);
 const choose=()=>({activationId:activation,dieIndex:0});
 const uses=()=>Number(sql(`select count(*) from dndkeep_private.sharpened_damage_uses where character_id='${char}'`));
 function activate(finalize=true,roll=8){
  const turn=run(`select get_psionic_discipline_turn('${char}')`,player).turn;
  const snapshot=JSON.parse(sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`));
  run(`select begin_psionic_discipline('${char}','${activation}',${encoded(turn)},'sharpened-mind',array[${roll}],1,4,${encoded(snapshot)})`,player);
  if(finalize)run(`select finalize_sharpened_roll('${char}','${activation}')`,player);
 }
 function nextAttack(){
  const id=randomUUID();sql(`insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id,damage_final,psionic_damage_dice)
   select '${id}',campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,'damage_rolled',damage_dice,damage_type,'${randomUUID()}',13,psionic_damage_dice from pending_attacks where id='${attack}'`);return id;
 }
 // v2.867: exercise real paid declaration and queue, then controlled saved dice.
 function psychicSpell(source='class:Psion',passed=false){
  sql(`delete from pending_attacks where id='${attack}';update characters set prepared_spells=ARRAY['mind-spike'],spell_sources='{"mind-spike":["${source}"]}',spell_preparation_sources='{"mind-spike":["${source}"]}',spell_slots='{"2":{"total":1,"used":0}}' where id='${char}'`);
  const context={source,spellLevel:2,saveDC:18,combat:{kind:'save',attackMode:null,damageDice:'3d8',damageType:'Psychic',attackBonus:null,targetAC:null,saveAbility:'WIS',saveSuccessEffect:'half',actorCombatantId:cb,target:{participantId:cp,entityId:char,type:'character',combatantId:cb}}};
  run(`select declare_spell_cast_atomic('${attack}','${char}','${cp}','mind-spike','Mind Spike',2,'{"total":1,"used":0}',${encoded(context)})`,player);
  sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${attack}'`);
  run(`select settle_declared_spell_atomic('${attack}')`,player);run(`select queue_declared_spell_attack('${attack}')`,player);
  const packet={version:1,components:[{key:'base',source:'base',label:'Mind Spike',expression:'3d8',damageType:'psychic',rolls:[1,5,3],dieKinds:['rolled','rolled','rolled'],modifier:0,rawTotal:9}]};
  sql(`update pending_attacks set state='damage_rolled',save_result='${passed?'passed':'failed'}',damage_rolls=array[1,5,3],damage_raw=9,damage_final=${passed?4:9},damage_components=${encoded(packet)} where id='${attack}'`);
 }
 test('paid Psychic save applies resistance and one atomic receipt',()=>{
  psychicSpell();const p=preview();expect(p.damageAfter).toBe(4);const first=apply(p);expect(first.settlement).toMatchObject({damage:4,afterHP:99,afterTempHP:0});expect(apply(p).replayed).toBe(true);expect(uses()).toBe(0);
 });
 test('Psion spell replacement happens before a successful save halves damage',()=>{
  activate();psychicSpell('class:Psion',true);const p=preview(choose());expect(p).toMatchObject({bypass:true,damageBefore:4,damageAfter:8,replacement:{original:1,replacement:8}});
  expect(apply(p).settlement.damage).toBe(8);expect(uses()).toBe(1);
 });
 test('other-class Psychic spells allow replacement but retain resistance',()=>{
  sql(`update characters set level=17,secondary_class='Wizard',secondary_level=3 where id='${char}'`);activate();psychicSpell('class:Wizard',true);
  const p=preview(choose());expect(p).toMatchObject({bypass:false,damageBefore:4,damageAfter:4});expect(apply(p).settlement.damage).toBe(4);expect(uses()).toBe(1);
 });
 test('zero damage after save and resistance cannot trigger a replacement',()=>{
  sql(`update characters set level=17,secondary_class='Wizard',secondary_level=3 where id='${char}'`);activate();psychicSpell('class:Wizard',true);
  sql(`update pending_attacks set damage_rolls=array[1,1,1],damage_raw=3,damage_final=1,damage_components=jsonb_set(jsonb_set(damage_components,'{components,0,rolls}','[1,1,1]'),'{components,0,rawTotal}','3') where id='${attack}'`);
  expect(preview().damageAfter).toBe(0);expect(()=>preview(choose())).toThrow(/must take Psychic damage/);expect(uses()).toBe(0);
 });
 test('changed captured spell source cannot grant Psion resistance bypass',()=>{
  psychicSpell();sql(`update pending_attacks set spell_cast_source='class:Wizard' where id='${attack}'`);expect(()=>preview()).toThrow(/original paid Psychic spell/);
 });
 test('Psychic spell immunity prevents replacement and turn consumption',()=>{
  activate();psychicSpell();sql(`update characters set damage_immunities=array['psychic'] where id='${char}'`);expect(preview().damageAfter).toBe(0);expect(()=>preview(choose())).toThrow(/must take Psychic/);expect(uses()).toBe(0);
 });
 test('edited Psychic spell dice or paid targeting cannot enter the atomic path',()=>{
  psychicSpell();sql(`update pending_attacks set damage_dice='4d8' where id='${attack}'`);expect(()=>preview()).toThrow(/paid Psychic spell changed/);expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('100');
 });
 test('legacy Psychic spell without a payment receipt is not guessed',()=>{
  psychicSpell();sql(`delete from dndkeep_private.declared_spell_payments where cast_id='${attack}'`);expect(()=>preview()).toThrow(/original paid Psychic spell/);
 });
 // v2.865: old callers must enter the same defense/Sharpened settlement.
 const direct=(id=attack)=>run(`select apply_psionic_pending_damage('${id}',${encoded(run(`select get_pending_damage_context('${id}')`))},2)`);
 test('direct application respects resistance and returns the same saved resolution',()=>{
  const result=direct();expect(result.settlement.damage).toBe(6);expect(result.resolution.bypass).toBe(false);
  expect(run(`select apply_psionic_pending_damage('${attack}')`).replayed).toBe(true);expect(uses()).toBe(0);
 });
 test('a direct winner prevents a later replacement request from spending or damaging again',()=>{
  activate();const selected=preview(choose());const first=direct();
  expect(first.settlement.damage).toBe(13);const replay=apply(selected);
  expect(replay.replayed).toBe(true);expect(replay.settlement.damage).toBe(13);expect(uses()).toBe(0);
 });
 test('direct application preserves immunity despite active Sharpened Mind',()=>{
  activate();sql(`update characters set damage_immunities=array['psychic'] where id='${char}'`);
  expect(direct().settlement.damage).toBe(0);expect(uses()).toBe(0);
 });
 test('direct application bypasses resistance but preserves vulnerability without spending Attack Mode',()=>{
  activate();sql(`update characters set damage_vulnerabilities=array['psychic'] where id='${char}'`);
  const result=direct();expect(result.settlement.damage).toBe(26);expect(result.resolution.bypass).toBe(true);expect(uses()).toBe(0);
 });
 test('direct application refuses unknown defenses and leaves HP and state untouched',()=>{
  sql(`update characters set damage_resistances=array['psychic while sleeping'] where id='${char}'`);
  expect(()=>direct()).toThrow(/Review Psychic defenses/);
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('100');
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('damage_rolled');
 });
 test('applies Psychic resistance once without an active Sharpened effect',()=>{
  const plan=preview();expect(plan).toMatchObject({damageBefore:13,damageAfter:6,bypass:false,defensesKnown:true});
  expect(apply(plan).settlement).toMatchObject({damage:6,afterHP:97,afterTempHP:0});expect(uses()).toBe(0);
 });
 test('active Sharpened bypasses Psychic resistance without consuming Attack Mode',()=>{
  activate();expect(preview()).toMatchObject({damageAfter:13,bypass:true,usedThisTurn:false});
  expect(apply().settlement).toMatchObject({damage:13,afterHP:90});expect(uses()).toBe(0);
 });
 test('replaces the selected saved die, applies once and replays without extra use or resources',()=>{
  activate();const p=preview(choose());expect(p).toMatchObject({damageAfter:20,replacement:{original:1,replacement:8,dieIndex:0}});
  const first=apply(p);expect(first.settlement).toMatchObject({damage:20,afterHP:83});expect(apply(p).replayed).toBe(true);expect(uses()).toBe(1);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`)).toBe('11');
 });
 test('cannot replace again this turn, but a different combat turn permits it',()=>{
  activate();apply(preview(choose()));const second=nextAttack();
  expect(()=>preview(choose(),second)).toThrow(/already used this turn/);
  sql(`update combat_encounters set round_number=round_number+1 where id='${enc}'`);
  expect(apply(preview(choose(),second),second).settlement.damage).toBe(20);expect(uses()).toBe(2);
 });
 test('immunity prevents both damage and spending Attack Mode; vulnerability remains after bypass',()=>{
  activate();sql(`update characters set damage_immunities=array['psychic'] where id='${char}'`);
  expect(preview().damageAfter).toBe(0);expect(()=>preview(choose())).toThrow(/must take Psychic damage/);expect(uses()).toBe(0);
  sql(`update characters set damage_immunities='{}',damage_vulnerabilities=array['psychic'] where id='${char}'`);
  expect(preview(choose()).damageAfter).toBe(40);
 });
 test('unknown conditional defenses need an explicit DM decision',()=>{
  sql(`update characters set damage_resistances=array['psychic while sleeping'] where id='${char}'`);
  expect(preview()).toMatchObject({defensesKnown:false,damageAfter:null});expect(()=>apply()).toThrow(/Review Psychic defenses/);
  expect(apply(preview({affinity:'resistant'})).settlement.damage).toBe(6);
 });
 test('unfinished and incapacitation-ended activations cannot replace dice',()=>{
  activate(false);expect(preview()).toMatchObject({pendingActivation:true,damageAfter:13,bypass:true});expect(()=>preview(choose())).toThrow(/finalized, active/);
  run(`select finalize_sharpened_roll('${char}','${activation}')`,player);
  sql(`update combatants set active_conditions=array['Stunned'] where id='${cb}'`);
  expect(()=>preview(choose())).toThrow(/finalized, active/);
  sql(`update combatants set active_conditions='{}' where id='${cb}'`);expect(preview().bypass).toBe(false);
 });
 test('changed HP or turn rejects a stale preview without consuming the turn',()=>{
  activate();const p=preview(choose());sql(`update combat_encounters set round_number=round_number+1 where id='${enc}'`);
  expect(()=>apply(p)).toThrow(/preview changed/);expect(uses()).toBe(0);
 });
 test('final receipt failure rolls back replacement usage, HP and events',()=>{
  activate();const p=preview(choose());expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';
   create function pg_temp.reject_sharpened_receipt() returns trigger language plpgsql as $$begin raise exception 'injected final failure';end;$$;
   create trigger reject_sharpened_receipt before insert on dndkeep_private.psionic_damage_applications for each row execute function pg_temp.reject_sharpened_receipt();
   select public.apply_psionic_damage_resolution('${attack}',${encoded(p)},2);rollback;`)).toThrow(/injected final failure/);
  expect(uses()).toBe(0);expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('100');expect(apply(p).settlement.damage).toBe(20);
 });
 test('players and anonymous users cannot resolve or inspect a DM damage preview',()=>{
  expect(()=>run(`select preview_psionic_damage('${attack}')`,player)).toThrow(/current DM/);
  expect(()=>sql(`set role anon;select preview_psionic_damage('${attack}')`)).toThrow(/permission denied/);
  expect(()=>sql(auth(player,'select * from dndkeep_private.sharpened_damage_uses'))).toThrow(/permission denied/);
 });
 test('replacement is available on another creature’s turn, not only the Psion turn',()=>{
  activate();apply(preview(choose()));
  const other=randomUUID();sql(`insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${other}','${enc}','${campaign}','creature','other','Other actor',1);update combat_encounters set current_turn_index=1 where id='${enc}'`);
  const next=nextAttack();expect(apply(preview(choose(),next),next).settlement.damage).toBe(20);expect(uses()).toBe(2);
 });
 test('an expired duration cannot bypass resistance or spend replacement',()=>{
  activate();run(`select advance_campaign_time('${campaign}','${randomUUID()}','seconds',60,10)`);
  expect(preview()).toMatchObject({bypass:false,damageAfter:6});expect(()=>preview(choose())).toThrow(/finalized, active/);expect(uses()).toBe(0);
 });
 test('sheet wards participate in defense resolution and stale-preview rejection',()=>{
  const p=preview();sql(`update characters set active_buffs='[{"id":"ward","name":"Ward","resistances":[" Psychic "]}]',damage_resistances='{}' where id='${char}'`);
  expect(preview()).toMatchObject({resistant:true,damageAfter:6});expect(()=>apply(p)).toThrow(/preview changed/);
  sql(`update characters set active_buffs='[{"id":"ward","name":"Ward","immunities":["psychic"]}]' where id='${char}'`);expect(preview().damageAfter).toBe(0);
 });
 test('manual damage edits commit with a private adjustment event and cannot silently replace adjusted dice',()=>{
  activate();expect(()=>preview({...choose(),amount:10})).toThrow(/adjusted damage/);
  const result=apply(preview({amount:10}));expect(result.settlement.damage).toBe(10);expect(uses()).toBe(0);
  expect(sql(`select visibility from combat_events where campaign_id='${campaign}' and event_type='dm_fudge'`)).toBe('hidden_from_players');
  expect(sql(`select payload->'resolution' ? 'choice' from combat_events where campaign_id='${campaign}' and event_type='damage_applied'`)).toBe('f');
 });
 test('deleting an applied attack cannot refund the current turn use',()=>{
  activate();const next=nextAttack();apply(preview(choose()));sql(`delete from pending_attacks where id='${attack}'`);
  expect(uses()).toBe(1);expect(()=>preview(choose(),next)).toThrow(/already used this turn/);
 });
 test('concurrent applications of different attacks cannot both use the same turn',async()=>{
  activate();const next=nextAttack(),firstPlan=preview(choose()),secondPlan=preview(choose(),next);
  const parallel=(id:string,p:unknown)=>new Promise<{code:number|null;out:string;error:string}>(resolve=>{
   const child=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='',error='';
   child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(auth(dm,`select apply_psionic_damage_resolution('${id}',${encoded(p)},2)`));
  });
  const results=await Promise.all([parallel(attack,firstPlan),parallel(next,secondPlan)]);expect(results.filter(r=>r.code===0)).toHaveLength(1);
  expect(results.find(r=>r.code!==0)?.error).toMatch(/already used this turn|preview changed/);expect(uses()).toBe(1);expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('83');
 });

 test('paid Enkindled extras can produce a recorded 36 without changing the original damage dice',()=>{
  activate(false,12);run(`select enhance_sharpened_roll('${char}','${activation}','${randomUUID()}','enkindled',array[12,12],null)`,player);
  expect(run(`select finalize_sharpened_roll('${char}','${activation}')`,player).total).toBe(36);
  expect(preview(choose())).toMatchObject({damageAfter:48,replacement:{original:1,replacement:36}});
  apply(preview(choose()));expect(JSON.parse(sql(`select psionic_damage_dice->'rolls' from pending_attacks where id='${attack}'`))).toEqual([1,5,3]);
 });
 test('an optional replacement can lower damage and overlapping records never give extra turn uses',()=>{
  activate();const first=activation;sql(`update combat_encounters set round_number=round_number+1 where id='${enc}'`);activation=randomUUID();activate(true,2);
  expect(preview().activations.map((v:{total:number})=>v.total).sort()).toEqual([2,8]);
  expect(preview({activationId:first,dieIndex:0}).damageAfter).toBe(20);
  const p=preview({activationId:activation,dieIndex:1});expect(p.damageAfter).toBe(10);apply(p);
  expect(()=>preview({activationId:first,dieIndex:0},nextAttack())).toThrow(/already used this turn/);
 });

});
