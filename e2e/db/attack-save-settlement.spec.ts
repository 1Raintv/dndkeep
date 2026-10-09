import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
import {CONDITIONS} from '../../src/data/conditions';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>error+=d);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic ordinary saves',()=>{
 gateDbSuite();let dm:string,owner:string,campaign:string,encounter:string,character:string,caster:string,target:string,attack:string,chain:string;
 test.beforeEach(()=>{
  [dm,owner,campaign,encounter,character,caster,target,attack,chain]=Array.from({length:9},()=>randomUUID());
  sql(`begin;
   insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@save.local','{}'),('${owner}','${owner}@save.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Save transaction');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,nat_1_20_saves) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5,false);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,in_lair) values('${encounter}','${campaign}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${caster}','${encounter}','${campaign}','character','${character}','Psion',0),
    ('${target}','${encounter}','${campaign}','creature','${randomUUID()}','Target',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,save_dc,save_ability,save_success_effect,damage_dice,damage_type,state,chain_id)
    values('${attack}','${campaign}','${encounter}','${caster}','Psion','character','${target}','Target','creature','spell','Save fixture','save',10,'INT','none','1d6','Psychic','declared','${chain}');commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${dm}');`));
 const context=()=>JSON.parse(sql(auth(dm,`select get_pending_attack_save_context('${attack}')`)));
 const command=(dice=[12],d4:number|null=3,expected=context(),id=attack,base=0)=>`select settle_pending_attack_save('${id}','${JSON.stringify(expected).replaceAll("'","''")}',array[${dice}]::integer[],${base},0,'[]',${d4??'null'})`;
 const settle=(dice=[12],d4:number|null=3)=>JSON.parse(sql(auth(dm,command(dice,d4))));
 function sliver(){const id=randomUUID(),ctx=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${encounter}','${caster}')`));sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${id}','${encounter}','${caster}','${target}','${ctx.turnId}',${ctx.castTurnOrdinal},'active')`);return id;}
 const consumed=(id:string)=>sql(`select coalesce(consumed_by::text,'unused') from dndkeep_private.mind_sliver_effects where cast_id='${id}'`);
 test('penalty changes actual result and log once; retry keeps original dice',()=>{
  const effect=sliver(),r=settle();expect(r).toMatchObject({attack:{save_d20:12,save_total:9,save_result:'failed'},penalty:{penalty:3,consumedIds:[effect]},dice:[12],replayed:false});
  expect(consumed(effect)).toBe(attack);expect(settle([20],4)).toMatchObject({...r,replayed:true});
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  expect(JSON.parse(sql(`select payload from combat_events where chain_id='${chain}'`))).toMatchObject({total:9,result:'failed',penalty:{penalty:3}});
 });
 test('a penalized failure offers the final lair-only resistance charge',()=>{
  sliver();sql(`update combat_participants set legendary_resistance=3,legendary_resistance_used=3 where id='${target}'`);
  expect(settle().attack).toMatchObject({save_result:'failed',pending_lr_decision:true});
  sql(auth(dm,`select decide_legendary_resistance('${attack}',true)`));
  expect(settle().attack).toMatchObject({save_result:'passed',pending_lr_decision:false});
  expect(sql(`select legendary_resistance_used from combat_participants where id='${target}'`)).toBe('4');
 });
 test('automatic failure consumes the trigger without any dice',()=>{
  const effect=sliver();sql(`update pending_attacks set save_ability='STR' where id='${attack}';update combatants set active_conditions=array['Paralyzed'] where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(settle([],null)).toMatchObject({attack:{save_result:'failed'},dice:[],penalty:{penalty:0,die:null,consumedIds:[effect]}});expect(consumed(effect)).toBe(attack);
 });
 test('disadvantage keeps the lower die before applying the penalty',()=>{
  sliver();sql(`update pending_attacks set save_ability='DEX' where id='${attack}';update combatants set active_conditions=array['Restrained'] where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(settle([17,8])).toMatchObject({attack:{save_d20:8,save_total:5,save_result:'failed'},dice:[17,8]});
 });
 test('cover and exhaustion apply exactly once',()=>{
  sql(`update pending_attacks set save_ability='DEX',cover_level='three_quarters' where id='${attack}';update combatants set exhaustion_level=2 where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(settle().attack.save_total).toBe(13);
 });
 for(const natural of [false,true])test(`character natural-one house rule ${natural} remains authoritative`,()=>{
  sql(`update pending_attacks set target_participant_id='${caster}',target_type='character' where id='${attack}';update characters set nat_1_20_saves=${natural} where id='${character}'`);
  const r=JSON.parse(sql(auth(dm,command([1],3,context(),attack,12))));expect(r.attack.save_result).toBe(natural?'failed':'passed');
 });
 test('a creature natural twenty can still fail',()=>{
  sql(`update pending_attacks set save_dc=30 where id='${attack}'`);expect(settle([20]).attack.save_result).toBe('failed');
 });
 for(const change of ['target','conditions','cover'])test(`stale ${change} refuses the result and leaves the penalty`,()=>{
  const effect=sliver(),expected=context();
  if(change==='target')sql(`update pending_attacks set target_participant_id='${caster}',target_type='character' where id='${attack}'`);
  if(change==='conditions')sql(`update combatants set active_conditions=array['Poisoned'] where id=(select combatant_id from combat_participants where id='${target}')`);
  if(change==='cover')sql(`update pending_attacks set cover_level='half' where id='${attack}'`);
  expect(()=>sql(auth(dm,command([12],3,expected)))).toThrow(/settings changed/);expect(consumed(effect)).toBe('unused');
 });
 test('a player cannot read or settle the DM save',()=>{
  const effect=sliver();expect(()=>sql(auth(owner,command()))).toThrow(/Only this campaign DM/);
  expect(()=>sql(auth(owner,`select get_pending_attack_save_context('${attack}')`))).toThrow(/Only this campaign DM/);expect(consumed(effect)).toBe('unused');
 });
 test('two concurrent confirmations commit one save and one log',async()=>{
  sliver();const expected=context();const results=await Promise.all([parallel(auth(dm,command([12],3,expected))),parallel(auth(dm,command([19],4,expected)))]);
  expect(results.map(r=>r.code),JSON.stringify(results)).toEqual([0,0]);const receipts=results.map(r=>JSON.parse(r.out));expect(receipts.map(r=>r.replayed).sort()).toEqual([false,true]);expect(receipts[0].attack).toEqual(receipts[1].attack);
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
 });
 test('event failure rolls back the save and consumed penalty',()=>{
  const effect=sliver();expect(()=>sql(`begin;create function pg_temp.reject_save_event() returns trigger language plpgsql as $$begin raise exception 'fixture log failure';end;$$;create trigger fixture_reject_save before insert on public.combat_events for each row execute function pg_temp.reject_save_event();set local role authenticated;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';${command()};commit;`)).toThrow(/fixture log failure/);
  expect(consumed(effect)).toBe('unused');expect(sql(`select save_result is null from pending_attacks where id='${attack}'`)).toBe('t');expect(settle().attack.save_total).toBe(9);
 });
 for(const dice of [[],[0],[21],[12,15]])test(`invalid dice ${JSON.stringify(dice)} never consume a penalty`,()=>{
  const effect=sliver();expect(()=>settle(dice)).toThrow(/Invalid saved dice/);expect(consumed(effect)).toBe('unused');
 });
 test('hidden creature save events remain hidden',()=>{
  sql(`update combat_participants set hidden_from_players=true where id='${target}'`);settle();expect(sql(`select visibility from combat_events where chain_id='${chain}'`)).toBe('hidden_from_players');
 });
 test('resolved saves replay after combat ends',()=>{
  const r=settle();sql(`update combat_encounters set status='ended' where id='${encounter}'`);expect(settle([1])).toMatchObject({...r,replayed:true});
 });
 test('two different saves cannot both consume one next-save penalty',async()=>{
  const effect=sliver(),second=randomUUID(),expected=context();
  sql(`insert into pending_attacks select (jsonb_populate_record(null::pending_attacks,to_jsonb(a)||jsonb_build_object('id','${second}','chain_id','${randomUUID()}'))).* from pending_attacks a where id='${attack}'`);
  const other={...expected,attack:{...expected.attack,id:second}};
  const results=await Promise.all([parallel(auth(dm,command([12],3,expected))),parallel(auth(dm,command([12],4,other,second)))]);
  expect(results.map(r=>r.code),JSON.stringify(results)).toEqual([0,0]);const receipts=results.map(r=>JSON.parse(r.out));
  expect(receipts.filter(r=>r.penalty.penalty>0)).toHaveLength(1);expect([attack,second]).toContain(consumed(effect));
 });
 test('database condition flags match the canonical condition table for every save ability',()=>{
  const abilities={STR:'strength',DEX:'dexterity',CON:'constitution',INT:'intelligence',WIS:'wisdom',CHA:'charisma'} as const;
  // One SQL call avoids per-condition container startup; every condition is checked.
  const checks=CONDITIONS.flatMap(condition=>Object.entries(abilities).map(([short,full])=>({condition,short,full})));
  const result=sql(checks.map(({condition,short})=>`update pending_attacks set save_ability='${short}' where id='${attack}';update combatants set active_conditions=array['${condition.name.replaceAll("'","''")}'] where id=(select combatant_id from combat_participants where id='${target}');select dndkeep_private.attack_save_context('${attack}');`).join('\n')).split('\n').map(row=>JSON.parse(row));
  checks.forEach(({condition,full},i)=>{
   const automatic=condition.autoFailSaves?.includes(full as 'strength')??false;
   expect(result[i].autoFail,condition.name+full).toBe(automatic);
   expect(result[i].disadvantage,condition.name+full).toBe(!automatic&&(condition.savingThrowDisadvantage?.includes(full as 'strength')??false));
  });
 });
 test('a live save bonus cannot be silently omitted',()=>{
  sql(`update combatants set active_buffs='[{"key":"bless","name":"Bless","saveBonus":"1d4"}]' where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(()=>settle()).toThrow(/buff contributions changed/);
  const expected=context(),contribution=[{key:'bless',name:'Bless',dice:'1d4',rolls:[2],total:2}];
  const r=JSON.parse(sql(auth(dm,`select settle_pending_attack_save('${attack}','${JSON.stringify(expected)}',array[7],0,2,'${JSON.stringify(contribution)}',3)`)));
  expect(r.attack.save_total).toBe(9);expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='buff_contributed'`)).toBe('1');
 });

 test('active Psionic Guards selects the higher Intelligence die before the penalty',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":6,"psion-disciplines":["psionic-guards"]}',intelligence=18 where id='${character}'`);
  const turn=JSON.parse(sql(auth(owner,`select get_psionic_discipline_turn('${character}')`))).turn;
  const expected=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${character}'`);
  sql(auth(owner,`select begin_psionic_discipline('${character}','${randomUUID()}','${JSON.stringify(turn)}','psionic-guards',array[]::integer[],1,4,'${expected}')`));
  sql(`update pending_attacks set target_participant_id='${caster}',target_type='character' where id='${attack}'`);
  const effect=sliver();sql(`update dndkeep_private.mind_sliver_effects set target_id='${caster}' where cast_id='${effect}'`);
  expect(context().advantage).toBe(true);expect(settle([4,12])).toMatchObject({attack:{save_d20:12,save_total:9,save_result:'failed'},dice:[4,12]});
 });

});
