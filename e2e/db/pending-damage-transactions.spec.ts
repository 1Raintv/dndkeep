import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,finishEmptyFixtureReactionWindow} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
const json=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const bonus=[{key:'once',name:'Fire rider',source:'test',singleUse:true,damageRider:{dice:'1d4+1',damageType:'fire'}},{key:'keep',name:'Other',source:'test'}];
const components=()=>({version:1,components:[{key:'base',source:'base',label:'Hit',expression:'1d6+2',damageType:'psychic',rolls:[3],dieKinds:['rolled'],modifier:2,rawTotal:5},{key:'rider:0:once',source:'rider',label:'Fire rider',expression:'1d4+1',damageType:'fire',rolls:[2],dieKinds:['rolled'],modifier:1,rawTotal:3}]});
test.describe('Atomic pending damage recording',()=>{
 gateDbSuite();let dm:string,player:string,other:string,campaign:string,char:string,cb:string,enc:string,cp:string,attack:string;
 test.beforeEach(()=>{
  [dm,player,other,campaign,char,cb,enc,cp,attack]=Array.from({length:9},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@damage.local','{}'),('${player}','${player}@damage.local','{}'),('${other}','${other}@damage.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Damage transaction');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player'),('${campaign}','${other}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background) values('${char}','${player}','${campaign}','Actor','Human','Psion','Sage');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${cb}','${campaign}','${player}','Actor','character','${char}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${cp}','${enc}','${campaign}','character','${char}','Actor',0,'${cb}');
   update combatants set active_buffs=${json(bonus)} where id='${cb}';${insert(attack)};commit;`);
  finishEmptyFixtureReactionWindow(sql,dm,attack,'post_attack_roll');
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${dm}','${player}','${other}')`));
 const insert=(id:string)=>`insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id) values('${id}','${campaign}','${enc}','${cp}','Actor','character','Target','Hit','attack_roll','melee','hit','attack_rolled','1d6+2','psychic','${randomUUID()}')`;
 const expected=(id=attack)=>JSON.parse(sql(`select jsonb_build_object('state',state,'attack_kind',attack_kind,'attack_source',attack_source,'hit_result',hit_result,'save_result',save_result,'save_success_effect',save_success_effect,'damage_dice',damage_dice,'damage_type',damage_type,'damage_group_id',damage_group_id,'attacker_participant_id',attacker_participant_id,'target_participant_id',target_participant_id,'pending_lr_decision',pending_lr_decision) from pending_attacks where id='${id}'`));
 const call=(id=attack,packet:unknown=components(),final=8,snapshot:unknown=bonus,e=expected(id),rolls='array[3]',raw=5)=>`select record_pending_damage('${id}',${json(e)},${rolls},${raw},${final},${json(packet)},${snapshot===null?'null':json(snapshot)})`;
 const run=(q=call(),u=dm)=>JSON.parse(sql(auth(u,q)));
 const buffs=()=>JSON.parse(sql(`select active_buffs from combatants where id='${cb}'`));
 const state=()=>sql(`select state from pending_attacks where id='${attack}'`);
 for(const key of ['hunters_mark','hex','divine_favor','absorb_elements_rider'])for(const saved of ['failed','passed'])test(`${key} does not fire or get consumed on a ${saved} save`,()=>{
  const gated=[{...bonus[0],key},bonus[1]];
  sql(`update pending_attacks set attack_kind='save',save_result='${saved}',save_success_effect='half' where id='${attack}';update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  const packet=components();packet.components.pop();
  expect(run(call(attack,packet,saved==='passed'?2:5,gated)).attack.damage_components.components).toHaveLength(1);expect(buffs()).toEqual(gated);
 });
 test('legacy Hunter’s Mark records Force on a spell attack and preserves the stored entry',()=>{
  const gated=[{...bonus[0],key:'hunters_mark',singleUse:false,damageRider:{dice:'1d4+1',damageType:'piercing'}},bonus[1]];
  sql(`update pending_attacks set attack_source='spell' where id='${attack}';update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  const packet=components();packet.components[1].key='rider:0:hunters_mark';packet.components[1].damageType='force';
  expect(run(call(attack,packet,8,gated)).attack.damage_components.components[1].damageType).toBe('force');expect(buffs()).toEqual(gated);
 });
 test('old Hunter’s Mark Piercing totals are rejected without spending a bonus',()=>{
  const gated=[{...bonus[0],key:'hunters_mark',damageRider:{dice:'1d4+1',damageType:'piercing'}},bonus[1]];
  sql(`update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  const packet=components();packet.components[1].key='rider:0:hunters_mark';packet.components[1].damageType='piercing';
  expect(()=>run(call(attack,packet,8,gated))).toThrow(/Damage bonus type changed/);expect(buffs()).toEqual(gated);
 });
 test('legacy melee-only Divine Favor adds damage to a ranged weapon hit',()=>{
  const gated=[{...bonus[0],key:'divine_favor',onlyMelee:true},bonus[1]];
  sql(`update pending_attacks set attack_source='weapon',attack_mode='ranged' where id='${attack}';update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  const packet=components();packet.components[1].key='rider:0:divine_favor';
  expect(run(call(attack,packet,8,gated)).attack.damage_final).toBe(8);
 });
 test('Divine Favor cannot apply to a melee spell attack',()=>{
  const gated=[{...bonus[0],key:'divine_favor'},bonus[1]];
  sql(`update pending_attacks set attack_source='spell',attack_mode='melee' where id='${attack}';update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  const packet=components();packet.components.pop();expect(run(call(attack,packet,5,gated)).attack.damage_final).toBe(5);expect(buffs()).toEqual(gated);
 });
 test('ranged spell excludes a melee-only rider and preserves it for later',()=>{
  const gated=[{...bonus[0],onlyMelee:true},bonus[1]];
  sql(`update pending_attacks set attack_source='spell',attack_mode='ranged' where id='${attack}';update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  const packet=components();packet.components=packet.components.slice(0,1);
  const result=run(call(attack,packet,5,gated,{...expected(),attack_mode:'ranged'}));
  expect(result.attack.damage_final).toBe(5);expect(buffs()).toEqual(gated);
 });
 test('melee spell includes and consumes its melee-only rider',()=>{
  const gated=[{...bonus[0],onlyMelee:true},bonus[1]];
  sql(`update pending_attacks set attack_source='spell',attack_mode='melee' where id='${attack}';update combatants set active_buffs=${json(gated)} where id='${cb}'`);
  expect(run(call(attack,components(),8,gated,{...expected(),attack_mode:'melee'})).attack.damage_final).toBe(8);expect(buffs()).toEqual([bonus[1]]);
 });
 test('a changed attack mode rejects a stale damage record without consuming bonuses',()=>{
  const captured={...expected(),attack_mode:null};sql(`update pending_attacks set attack_mode='ranged' where id='${attack}'`);
  expect(()=>run(call(attack,components(),8,bonus,captured))).toThrow(/Attack changed/);expect(buffs()).toEqual(bonus);expect(state()).toBe('attack_rolled');
 });
 test('owner records dice and consumes only the eligible one-use bonus together',()=>{const r=run(call(),player);expect(r.replayed).toBe(false);expect(r.attack.damage_final).toBe(8);expect(r.attack.damage_components).toEqual(components());expect(buffs()).toEqual([bonus[1]]);});
 test('exact replay cannot consume a reapplied bonus',()=>{const q=call(),first=run(q);sql(`update combatants set active_buffs=${json(bonus)} where id='${cb}'`);expect(run(q)).toEqual({...first,replayed:true});expect(buffs()).toEqual(bonus);});
 test('two simultaneous calls for one attack return one saved roll',async()=>{const q=call();const r=await Promise.all([parallel(auth(dm,q)),parallel(auth(player,q))]);expect(r.every(v=>v.code===0),JSON.stringify(r)).toBe(true);expect(r.map(v=>JSON.parse(v.out).replayed).sort()).toEqual([false,true]);expect(buffs()).toEqual([bonus[1]]);});
 test('two different attacks cannot spend the same one-use bonus',async()=>{const second=randomUUID();sql(insert(second));finishEmptyFixtureReactionWindow(sql,dm,second,'post_attack_roll');const r=await Promise.all([parallel(auth(dm,call())),parallel(auth(dm,call(second)))]);expect(r.filter(v=>v.code===0)).toHaveLength(1);expect(r.find(v=>v.code!==0)?.error).toContain('bonuses changed');expect(sql(`select count(*) from dndkeep_private.damage_roll_records where attack_id in('${attack}','${second}')`)).toBe('1');});
 test('failed final-total validation rolls back the bonus and record',()=>{expect(()=>run(call(attack,components(),99))).toThrow(/Final damage/);expect(buffs()).toEqual(bonus);expect(state()).toBe('attack_rolled');expect(sql(`select count(*) from dndkeep_private.damage_roll_records where attack_id='${attack}'`)).toBe('0');});
 test('failed ledger insert rolls back a preceding bonus consumption and attack update',()=>{sql(`insert into dndkeep_private.damage_roll_records(attack_id,request) values('${attack}','{}')`);expect(()=>run()).toThrow(/duplicate key/);expect(buffs()).toEqual(bonus);expect(state()).toBe('attack_rolled');});
 test('stale attack or bonus snapshots cannot record damage',()=>{const q=call();sql(`update pending_attacks set damage_type='fire' where id='${attack}'`);expect(()=>run(q)).toThrow(/Attack changed/);expect(buffs()).toEqual(bonus);expect(()=>run(call(attack,components(),8,[]))).toThrow(/bonuses changed/);});
 test('nonowner membership, anonymous users and direct ledger access are denied',()=>{expect(()=>run(call(),other)).toThrow(/Only the attacker/);expect(()=>sql(`begin;set local role anon;${call()};commit;`)).toThrow(/permission denied/);expect(()=>sql(auth(player,'select * from dndkeep_private.damage_roll_records'))).toThrow(/permission denied/);expect(buffs()).toEqual(bonus);});
 test('removed campaign membership also denies replay',()=>{const q=call();run(q,player);sql(`delete from campaign_members where campaign_id='${campaign}' and user_id='${player}'`);expect(()=>run(q,player)).toThrow(/Only the attacker/);});
 test('miss records zero dice and leaves the bonus available',()=>{sql(`update pending_attacks set hit_result='miss' where id='${attack}'`);const r=run(call(attack,{version:1,components:[]},0,null,expected(),'array[]::integer[]',0));expect(r.attack.damage_final).toBe(0);expect(buffs()).toEqual(bonus);});
 test('save for half preserves existing separate base and rider rounding',()=>{sql(`update pending_attacks set attack_kind='save',save_result='passed',save_success_effect='half' where id='${attack}'`);expect(run(call(attack,components(),3)).attack.damage_final).toBe(3);expect(buffs()).toEqual([bonus[1]]);});
 test('save for none leaves one-use bonus available',()=>{sql(`update pending_attacks set attack_kind='save',save_result='passed',save_success_effect='none' where id='${attack}'`);const p=components();p.components.pop();expect(run(call(attack,p,0,null)).attack.damage_final).toBe(0);expect(buffs()).toEqual(bonus);});
 for(const filter of ['onlyMelee','onlyRanged','onlyVsTargetParticipantId'])test('ineligible rider is retained: '+filter,()=>{const b=structuredClone(bonus) as Record<string,unknown>[];b[0][filter]=filter==='onlyVsTargetParticipantId'?randomUUID():true;sql(`update combatants set active_buffs=${json(b)} where id='${cb}'`);if(filter==='onlyMelee')sql(`update pending_attacks set attack_source='ranged' where id='${attack}'`);const p=components();p.components.pop();expect(run(call(attack,p,5,b)).attack.damage_final).toBe(5);expect(buffs()).toEqual(b);});
 test('mismatched character identity does not grant player ownership',()=>{sql(`update combat_participants set entity_id='${randomUUID()}' where id='${cp}'`);expect(()=>run(call(),player)).toThrow(/Only the attacker/);expect(buffs()).toEqual(bonus);});
 test('unresolved attack and legendary resistance cannot commit',()=>{sql(`update pending_attacks set hit_result=null where id='${attack}'`);expect(()=>run()).toThrow(/Resolve the attack/);sql(`update pending_attacks set hit_result='hit',pending_lr_decision=true where id='${attack}'`);expect(()=>run()).toThrow(/Resolve the attack/);expect(buffs()).toEqual(bonus);});
 for(const bad of ['null-kind','wrong-type','wrong-key','bad-total','missing-label'])test('malformed component rejected: '+bad,()=>{const p=components();const c=p.components[1] as Record<string,unknown>;if(bad==='null-kind')c.dieKinds=[null];if(bad==='wrong-type')c.damageType='psychic';if(bad==='wrong-key')c.key='rider:0:other';if(bad==='bad-total')c.rawTotal=12;if(bad==='missing-label')delete c.label;expect(()=>run(call(attack,p))).toThrow();expect(buffs()).toEqual(bonus);expect(state()).toBe('attack_rolled');});
 const seed={version:1,sides:8,originalRolls:[1,5,3],rolls:[4,5,4],modifier:4};
 const seeded=(dice:unknown=seed,total='17')=>{const id=randomUUID();sql(`insert into pending_attacks select (jsonb_populate_record(null::pending_attacks,to_jsonb(a)||jsonb_build_object('id','${id}','attack_kind','auto_hit','attack_name','Destructive Thoughts','damage_dice','${total}','psionic_damage_dice',${json(dice)}))).* from pending_attacks a where id='${attack}'`);return id;};
 test('saved Psion dice cannot be edited after declaration',()=>{const id=seeded();expect(()=>sql(`update pending_attacks set psionic_damage_dice=null where id='${id}'`)).toThrow(/cannot be changed/);});
 test('saved Psion total and every adjusted die must match their originals',()=>{expect(()=>seeded(seed,'18')).toThrow(/does not match/);expect(()=>seeded({...seed,rolls:[4,5,3]})).toThrow(/Surge dice/);expect(()=>seeded({...seed,originalRolls:[1,9,3]})).toThrow(/exceed their size/);});
 test('recording cannot silently replace saved Psion dice with another roll',()=>{const id=seeded();const packet={version:1,components:[{key:'base',source:'base',label:'Destructive Thoughts',expression:'3d8+4',damageType:'psychic',rolls:[4,5,4],dieKinds:['adjusted','rolled','adjusted'],modifier:4,rawTotal:17}]};expect(run(call(id,packet,17,null,expected(id),'array[4,5,4]',17)).attack.damage_raw).toBe(17);expect(()=>sql(`update pending_attacks set damage_rolls=array[3,6,4] where id='${id}'`)).toThrow(/lost its saved dice/);});

});
