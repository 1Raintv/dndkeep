import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
const parallel=(query:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});

test.describe('Declared spell combat delivery (local stack)',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,campaign:string,hero:string,caster:string,encounter:string,reactor:string,target:string,cast:string,offer:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,campaign,hero,caster,encounter,reactor,target,cast,offer]=Array.from({length:11},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@counter.local','{}'),('${dm}','${dm}@counter.local','{}'),('${outsider}','${outsider}@counter.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Counterspell transaction');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,intelligence,prepared_spells,spell_sources,spell_preparation_sources,spell_slots) values
   ('${hero}','${owner}','${campaign}','Reactor','Human','Psion','Sage',5,18,ARRAY['counterspell'],'{"counterspell":["class:Psion"]}','{"counterspell":["class:Psion"]}','{"3":{"total":2,"used":0}}'),
   ('${caster}','${dm}','${campaign}','Caster','Human','Wizard','Sage',17,20,'{}','{}','{}','{}');
   insert into combat_encounters(id,campaign_id,status) values('${encounter}','${campaign}','active');
   insert into combat_participants(id,campaign_id,encounter_id,participant_type,entity_id,name,turn_order) values
   ('${reactor}','${campaign}','${encounter}','character','${hero}','Reactor',0),('${target}','${campaign}','${encounter}','character','${caster}','Caster',1);
   insert into pending_spell_casts(id,campaign_id,encounter_id,chain_id,caster_participant_id,caster_character_id,caster_name,spell_name,spell_level,expires_at)
   values('${cast}','${campaign}','${encounter}','${randomUUID()}','${target}','${caster}','Caster','Wish',9,now()+interval '5 minutes');
   insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload)
   values('${offer}','${campaign}','${reactor}','Reactor','character','counterspell','Counterspell','spell_declared',now()+interval '5 minutes','{"spell_cast_id":"${cast}"}');`);
 });
 test.beforeEach(()=>sql(`update combat_encounters set current_turn_index=1 where id='${encounter}';delete from pending_reactions where id='${offer}';delete from pending_spell_casts where id='${cast}';
  update characters set spell_slots='{"3":{"total":3,"used":0},"4":{"total":1,"used":0}}',prepared_spells=ARRAY['fly'],spell_sources='{"fly":["class:Wizard"],"light":["class:Wizard"]}',spell_preparation_sources='{"fly":["class:Wizard"]}' where id='${caster}'`));
 test.afterEach(()=>sql(`delete from pending_reactions where campaign_id='${campaign}';delete from pending_spell_casts where campaign_id='${campaign}';delete from pending_attacks where campaign_id='${campaign}';delete from combat_participants where campaign_id='${campaign}';delete from combat_encounters where campaign_id='${campaign}';delete from characters where campaign_id='${campaign}';delete from combatants where campaign_id='${campaign}';delete from campaigns where id='${campaign}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));

 const character=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${caster}'`));
 const declare=(id=cast,level=3,expected=character().spell_slots[String(level)]??null,spell=level===0?'light':'fly',combat=intent())=>`select declare_spell_cast_atomic('${id}','${caster}','${target}','${spell}','${spell}',${level},${expected===null?'null':"'"+JSON.stringify(expected)+"'"},'{"source":"class:Wizard","actionKind":"action","isBonusAction":false,"spellLevel":${level===0?0:3},"target":"Reactor","saveDC":15,"combat":${JSON.stringify(combat)}}')`;
 const settle=(id=cast)=>`select settle_declared_spell_atomic('${id}')`;
 function counter(id=cast,passed=false){
  const offerId=randomUUID();
  sql(`update combat_participants set reaction_used=false where id='${reactor}';
   insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload)
   values('${offerId}','${campaign}','${reactor}','Reactor','character','counterspell','Counterspell','spell_declared',now()+interval '5 minutes','{"spell_cast_id":"${id}"}')`);
  const c=JSON.parse(sql(`select row_to_json(c) from characters c where id='${hero}'`));
  const expected={...Object.fromEntries(['class_name','level','subclass','secondary_class','secondary_level','secondary_subclass','intelligence','wisdom','charisma','inventory','spell_sources','spell_preparation_sources','prepared_spells'].map(k=>[k,c[k]])),slot:c.spell_slots['3']};
  const receipt=JSON.parse(sql(auth(owner,`select accept_counterspell_atomic('${offerId}',3,'class:Psion','intelligence',4,'${JSON.stringify(expected)}')`)));
  sql(`update pending_attacks set save_result='${passed?'passed':'failed'}',save_d20=${passed?20:1},save_total=${passed?22:3} where id='${receipt.attackId}'`);
  return receipt.attackId;
 }
 const intent=()=>({kind:'save',attackMode:null as string|null,damageDice:'3d8+4',damageType:'Psychic',attackBonus:null as number|null,targetAC:null as number|null,
  saveAbility:'WIS' as string|null,saveSuccessEffect:'half' as string|null,actorCombatantId:sql(`select combatant_id from combat_participants where id='${target}'`)||null,target:{participantId:reactor,entityId:hero,type:'character',combatantId:sql(`select combatant_id from combat_participants where id='${reactor}'`)||null}});
 const queue=(id=cast)=>`select queue_declared_spell_attack('${id}')`;
 function ready(){sql(auth(dm,declare()));sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${cast}'`);sql(auth(dm,settle()));}
 const attacks=()=>sql(`select count(*) from pending_attacks where id='${cast}'`);
 for(const attackMode of ['melee','ranged'])test(`keeps ${attackMode} delivery through payment and retry`,()=>{
  const original={...intent(),kind:'attack_roll',attackMode,attackBonus:7,targetAC:16,saveAbility:null,saveSuccessEffect:null};
  sql(auth(dm,declare(cast,3,undefined,'fly',original)));sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${cast}'`);sql(auth(dm,settle()));
  sql(auth(dm,queue()));sql(auth(dm,queue()));
  expect(sql(`select attack_mode from pending_attacks where id='${cast}'`)).toBe(attackMode);expect(attacks()).toBe('1');
 });
 test('invalid mode or mode on a saving throw rolls back payment',()=>{
  for(const bad of [{...intent(),attackMode:'melee'},{...intent(),kind:'attack_roll',attackMode:'touch',attackBonus:7,targetAC:16,saveAbility:null,saveSuccessEffect:null}]){
   expect(()=>sql(auth(dm,declare(cast,3,undefined,'fly',bad)))).toThrow(/attack mode/);
   expect(character().spell_slots['3'].used).toBe(0);expect(attacks()).toBe('0');
  }
 });
 test('queues the paid values once and records the selected spell source',()=>{
  ready();const before=character().spell_slots;
  expect(JSON.parse(sql(auth(dm,queue())))).toMatchObject({castId:cast,attackId:cast,characterId:caster,kind:'save',replayed:false});
  expect(JSON.parse(sql(auth(dm,queue()))).replayed).toBe(true);expect(attacks()).toBe('1');expect(character().spell_slots).toEqual(before);
  expect(JSON.parse(sql(`select row_to_json(a) from pending_attacks a where id='${cast}'`))).toMatchObject({damage_dice:'3d8+4',damage_type:'Psychic',save_dc:15,save_ability:'WIS',save_success_effect:'half',target_participant_id:reactor,attack_source:'spell'});
  expect(JSON.parse(sql(`select payload from combat_events where campaign_id='${campaign}' and event_type='attack_declared'`))).toMatchObject({spell_cast_id:cast,casting_source:'class:Wizard'});
 });
 test('waits for a verified settlement, not a public cast state',()=>{
  sql(auth(dm,declare()));expect(()=>sql(auth(dm,queue()))).toThrow(/Settle/);expect(attacks()).toBe('0');
  sql(`update pending_spell_casts set state='resolved',outcome='went_off' where id='${cast}'`);
  expect(()=>sql(auth(dm,queue()))).toThrow(/Settle/);
 });
 test('interrupted spells never create damage and return the recorded slot',()=>{
  sql(auth(dm,declare()));counter();sql(auth(dm,settle()));expect(character().spell_slots['3'].used).toBe(0);
  expect(sql(`select action_used from combat_participants where id='${target}'`)).toBe('t');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${cast}'`)).toBe('1');
  expect(()=>sql(auth(dm,queue()))).toThrow(/interrupted/);expect(attacks()).toBe('0');
 });
 test('a successful Counterspell save retains the payment and permits delivery',()=>{
  sql(auth(dm,declare()));counter(cast,true);sql(auth(dm,settle()));sql(auth(dm,queue()));expect(attacks()).toBe('1');expect(character().spell_slots['3'].used).toBe(1);
 });
 test('concurrent retries create one attack and one history event',async()=>{
  ready();const results=await Promise.all([parallel(auth(dm,queue())),parallel(auth(dm,queue()))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(attacks()).toBe('1');
  expect(sql(`select count(*) from combat_events where campaign_id='${campaign}' and event_type='attack_declared'`)).toBe('1');
 });
 test('deleted attacks are never recreated, including after the encounter ends',()=>{
  ready();sql(auth(dm,queue()));sql(`delete from pending_attacks where id='${cast}';update combat_encounters set status='ended' where id='${encounter}'`);
  expect(JSON.parse(sql(auth(dm,queue()))).replayed).toBe(true);expect(attacks()).toBe('0');
 });
 test('another player cannot deliver or read a saved receipt',()=>{
  ready();expect(()=>sql(auth(outsider,queue()))).toThrow(/unavailable/);expect(()=>sql(auth(owner,queue()))).toThrow(/unavailable/);
  sql(auth(dm,queue()));expect(()=>sql(auth(outsider,queue()))).toThrow(/unavailable/);
 });
 test('an ended encounter rejects new delivery without charging again',()=>{
  ready();sql(`update combat_encounters set status='ended' where id='${encounter}'`);expect(()=>sql(auth(dm,queue()))).toThrow(/encounter ended/);expect(attacks()).toBe('0');expect(character().spell_slots['3'].used).toBe(1);
 });
 test('changed target identities block both initial payment and later delivery',()=>{
  const q=declare();sql(`update combat_participants set entity_id='${outsider}' where id='${reactor}'`);expect(()=>sql(auth(dm,q))).toThrow(/target changed/);expect(character().spell_slots['3'].used).toBe(0);
  sql(`update combat_participants set entity_id='${hero}' where id='${reactor}'`);ready();sql(`update combat_participants set entity_id='${outsider}' where id='${reactor}'`);
  expect(()=>sql(auth(dm,queue()))).toThrow(/target changed/);expect(attacks()).toBe('0');
 });
 test('hidden targets are unavailable to a player before and after payment',()=>{
  sql(`update characters set user_id='${owner}' where id='${caster}';update combat_participants set hidden_from_players=true where id='${reactor}'`);
  expect(()=>sql(auth(owner,declare()))).toThrow(/hidden/);expect(character().spell_slots['3'].used).toBe(0);
  sql(`update combat_participants set hidden_from_players=false where id='${reactor}'`);ready();
  sql(`update combat_participants set hidden_from_players=true where id='${reactor}'`);expect(()=>sql(auth(owner,queue()))).toThrow(/hidden/);
  sql(auth(dm,queue()));expect(attacks()).toBe('1');
 });
 for(const dice of ['0d6','101d6','1d1001','1d6oops','1d6+1d6','-99','999999999999'])test(`rejects unsupported damage ${dice} before payment`,()=>{
  expect(()=>sql(auth(dm,declare(cast,3,undefined,'fly',{...intent(),damageDice:dice})))).toThrow(/damage dice/);expect(character().spell_slots['3'].used).toBe(0);
 });
 test('an attack spell retains its attack bonus and target AC',()=>{
  sql(auth(dm,declare(cast,3,undefined,'fly',{...intent(),kind:'attack_roll',attackBonus:7,targetAC:16,saveAbility:null,saveSuccessEffect:null})));
  sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${cast}'`);sql(auth(dm,settle()));sql(auth(dm,queue()));
  expect(JSON.parse(sql(`select row_to_json(a) from pending_attacks a where id='${cast}'`))).toMatchObject({attack_kind:'attack_roll',attack_bonus:7,target_ac:16,save_dc:null,save_ability:null});
 });
 test('cantrip delivery spends no slot',()=>{
  const before=character().spell_slots;sql(auth(dm,declare(cast,0)));sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${cast}'`);sql(auth(dm,settle()));sql(auth(dm,queue()));
  expect(character().spell_slots).toEqual(before);expect(attacks()).toBe('1');
 });
 const sliverStatus=()=>sql(`select status from dndkeep_private.mind_sliver_effects where cast_id='${cast}'`);
 function declareSliver(){
  sql(`update characters set spell_sources=spell_sources||'{"mind-sliver":["class:Wizard"]}'::jsonb where id='${caster}'`);
  sql(auth(dm,declare(cast,0,null,'mind-sliver',{...intent(),damageDice:'4d6',saveAbility:'INT',saveSuccessEffect:'none'})));
 }
 function deliverSliver(){declareSliver();sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${cast}'`);sql(auth(dm,settle()));sql(auth(dm,queue()));}
 test('Mind Sliver records its original caster turn and target at declaration',()=>{
  declareSliver();expect(sliverStatus()).toBe('waiting');
  expect(JSON.parse(sql(`select jsonb_build_object('caster',caster_id,'target',target_id,'ordinal',cast_turn_ordinal,'turn',cast_turn) from dndkeep_private.mind_sliver_effects where cast_id='${cast}'`)))
   .toMatchObject({caster:target,target:reactor,ordinal:1,turn:sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`)});
 });
 test('Mind Sliver activates once on a final failed save and survives pending-row pruning',()=>{
  deliverSliver();sql(`update pending_attacks set save_result='failed',pending_lr_decision=false where id='${cast}'`);expect(sliverStatus()).toBe('active');
  sql(`update pending_attacks set save_result='failed' where id='${cast}';delete from pending_attacks where id='${cast}';delete from pending_spell_casts where id='${cast}'`);
  expect(sliverStatus()).toBe('active');
 });
 test('Mind Sliver waits for a resistance decision before activation',()=>{
  deliverSliver();sql(`update pending_attacks set save_result='failed',pending_lr_decision=true where id='${cast}'`);expect(sliverStatus()).toBe('waiting');
  sql(`update pending_attacks set pending_lr_decision=false where id='${cast}'`);expect(sliverStatus()).toBe('active');
 });
 test('Mind Sliver does not activate after a successful save or resistance',()=>{
  deliverSliver();sql(`update pending_attacks set save_result='failed',pending_lr_decision=true where id='${cast}';update pending_attacks set save_result='passed',pending_lr_decision=false where id='${cast}'`);
  expect(sliverStatus()).toBe('resisted');
 });
 test('Mind Sliver is not activated by an interrupted casting',()=>{
  declareSliver();counter();sql(auth(dm,settle()));expect(sliverStatus()).toBe('countered');expect(()=>sql(auth(dm,queue()))).toThrow(/interrupted/);
 });
 test('Mind Sliver target tampering rolls the save back',()=>{
  deliverSliver();expect(()=>sql(`update pending_attacks set target_participant_id='${target}',save_result='failed' where id='${cast}'`)).toThrow(/target or saving throw changed/);
  expect(sliverStatus()).toBe('waiting');expect(sql(`select save_result is null from pending_attacks where id='${cast}'`)).toBe('t');
 });
 test('Mind Sliver cancellation leaves no active penalty',()=>{
  deliverSliver();sql(`update pending_attacks set state='canceled' where id='${cast}'`);expect(sliverStatus()).toBe('canceled');
 });
 test('a different saved spell named Mind Sliver creates no origin',()=>{
  sql(auth(dm,declare().replace("'fly','fly'","'fly','Mind Sliver'")));expect(sliverStatus()).toBe('');
 });
 test('Mind Sliver pending effect records remain private',()=>{
  declareSliver();expect(()=>sql(auth(owner,`select * from dndkeep_private.mind_sliver_effects`))).toThrow(/permission denied/);
 });
 test('Mind Sliver delayed resolution expires at the end of the next caster turn',()=>{
  deliverSliver();
  for(let i=0;i<3;i++){
   const e=JSON.parse(sql(`select row_to_json(e) from combat_encounters e where id='${encounter}'`));
   const next=e.current_turn_index===1?0:1,round=e.round_number+(next===0?1:0);
   sql(auth(dm,`select commit_combat_clock_transition('${encounter}','${randomUUID()}','${e.psionic_turn_id}','${next===0?reactor:target}',${next},${round})`));
  }
  sql(`update pending_attacks set save_result='failed',pending_lr_decision=false where id='${cast}'`);expect(sliverStatus()).toBe('expired');
 });
 test('Mind Sliver requires the private delivery receipt before a save can activate it',()=>{
  deliverSliver();sql(`update dndkeep_private.declared_spell_payments set attack_receipt=null where cast_id='${cast}'`);
  expect(()=>sql(`update pending_attacks set save_result='failed' where id='${cast}'`)).toThrow(/delivery has not been verified/);expect(sliverStatus()).toBe('waiting');
 });
 for(const accept of [true,false])test(`Mind Sliver follows the atomic resistance decision (${accept})`,()=>{
  const creature=randomUUID(),entity=randomUUID();
  sql(`insert into combat_participants(id,campaign_id,encounter_id,participant_type,entity_id,name,turn_order,legendary_resistance) values('${creature}','${campaign}','${encounter}','creature','${entity}','Legendary target',2,3);
   update characters set spell_sources=spell_sources||'{"mind-sliver":["class:Wizard"]}'::jsonb where id='${caster}'`);
  sql(`update combatants set definition_type='custom',definition_id='${entity}' where id=(select combatant_id from combat_participants where id='${creature}')`);
  const combatant=sql(`select combatant_id from combat_participants where id='${creature}'`)||null;
  sql(auth(dm,declare(cast,0,null,'mind-sliver',{...intent(),damageDice:'4d6',saveAbility:'INT',saveSuccessEffect:'none',target:{participantId:creature,entityId:entity,type:'creature',combatantId:combatant}})));
  sql(`update pending_spell_casts set expires_at=now()-interval '1 minute' where id='${cast}'`);sql(auth(dm,settle()));sql(auth(dm,queue()));
  sql(`update pending_attacks set save_result='failed',pending_lr_decision=true where id='${cast}'`);expect(sliverStatus()).toBe('waiting');
  sql(auth(dm,`select decide_legendary_resistance('${cast}',${accept})`));expect(sliverStatus()).toBe(accept?'resisted':'active');
 });
});
