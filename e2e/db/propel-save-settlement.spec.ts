import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>error+=d);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Propel save settlement',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,character:string,campaign:string,encounter:string,caster:string,target:string,id:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,character,campaign,encounter,caster,target,id]=Array.from({length:9},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@propelsave.local','{}'),('${dm}','${dm}@propelsave.local','{}'),('${outsider}','${outsider}@propelsave.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Propel saves');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,class_resources) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5,'{"psionic-energy-dice":2}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,in_lair) values('${encounter}','${campaign}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${caster}','${encounter}','${campaign}','character','${character}','Psion',0),('${target}','${encounter}','${campaign}','creature','${target}','Target',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';`);
  const turn=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','context')`))).turnId;
  const payload=JSON.stringify({requestId:id,turnId:turn,mode:'powered',movement:'push',roll:3,target:{participantId:target,legalTargetConfirmed:true}});
  sql(auth(owner,`select psionic_propel('${character}','begin','${payload}');select psionic_propel('${character}','finalize','{"declarationId":"${id}"}')`));
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const context=()=>JSON.parse(sql(auth(owner,`select get_propel_save_context('${character}','${id}')`)));
 const command=(dice=[12],d4:number|null=3,expected=context(),base=0,buffTotal=0,buffs:unknown[]=[])=>`select settle_propel_save('${character}','${id}','${JSON.stringify(expected)}',10,array[${dice}]::integer[],${base},${buffTotal},'${JSON.stringify(buffs)}',${d4??'null'})`;
 const settle=(dice=[12],d4:number|null=3)=>JSON.parse(sql(auth(owner,command(dice,d4))));
 const decide=(accept:boolean,user=dm)=>JSON.parse(sql(auth(user,`select decide_propel_resistance('${character}','${id}',${accept})`)));
 const read=(user=owner)=>JSON.parse(sql(auth(user,`select get_propel_save('${character}','${id}')`))||'null');
 const energy=()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`);
 const condition=(v:string)=>sql(`update combatants set active_conditions=array['${v}'] where id=(select combatant_id from combat_participants where id='${target}')`);
 const legendary=()=>sql(`update combat_participants set legendary_resistance=3,legendary_resistance_used=3 where id='${target}'`);
 function sliver(){const effect=randomUUID(),ctx=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${encounter}','${caster}')`));sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${effect}','${encounter}','${caster}','${target}','${ctx.turnId}',${ctx.castTurnOrdinal},'active')`);return effect;}
 const consumed=(effect:string)=>sql(`select coalesce(consumed_by::text,'unused') from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`);
 test('Mind Sliver changes a success to failure and payment commits once',()=>{
  const effect=sliver(),r=settle();expect(r).toMatchObject({save:{d20:12,bonus:-3,total:9,outcome:'failed'},penalty:{saveKind:'feature',penalty:3,consumedIds:[effect]},finalOutcome:'failed',pendingResistance:false,record:{outcome:'failed',result:{energyCost:1}}});
  expect(consumed(effect)).toBe(id);expect(energy()).toBe('1');
  const replay=JSON.parse(sql(auth(owner,command([20],4,r.request.expected))));expect(replay).toMatchObject({save:r.save,replayed:true});expect(energy()).toBe('1');
  expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('1');
  expect(sql(`select notes from action_logs where id='${id}'`)).toContain('Mind Sliver deduction: 3');
 });
 test('unpenalized success spends no die',()=>{expect(settle()).toMatchObject({finalOutcome:'passed',record:{result:{energyCost:0}}});expect(energy()).toBe('2');});
 test('automatic failure consumes the next-save trigger without dice',()=>{const effect=sliver();condition('Paralyzed');expect(settle([],null)).toMatchObject({save:{rolls:[],automaticFailure:true,outcome:'failed'},penalty:{penalty:0,consumedIds:[effect]}});expect(consumed(effect)).toBe(id);expect(energy()).toBe('1');});
 test('disadvantage, buff and exhaustion feed the final arithmetic',()=>{
  sliver();condition('Encumbered');sql(`update combatants set exhaustion_level=1,active_buffs='[{"key":"bless","saveBonus":"1d4"}]' where id=(select combatant_id from combat_participants where id='${target}')`);
  const r=JSON.parse(sql(auth(owner,command([18,8],3,context(),2,4,[{key:'bless',dice:'1d4',rolls:[4],total:4}]))));expect(r.save).toMatchObject({d20:8,bonus:1,total:9,outcome:'failed',disadvantage:true});
 });
 test('stale context rejects before consuming a penalty or charging',()=>{const effect=sliver(),expected=context();condition('Paralyzed');expect(()=>sql(auth(owner,command([12],3,expected)))).toThrow(/settings changed/);expect(consumed(effect)).toBe('unused');expect(energy()).toBe('2');expect(read()).toBeNull();});
 test('invalid dice leave the effect and declaration untouched',()=>{const effect=sliver();expect(()=>settle([21])).toThrow(/Invalid Propel saving/);expect(consumed(effect)).toBe('unused');expect(read()).toBeNull();});
 test('payment failure rolls back the save and Mind Sliver consumption',()=>{const effect=sliver();sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);expect(()=>settle()).toThrow();expect(consumed(effect)).toBe('unused');expect(read()).toBeNull();expect(sql(`select outcome is null from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('t');});
 test('outsiders cannot settle or read a save or access raw receipts',()=>{expect(()=>sql(auth(outsider,command()))).toThrow(/unavailable/);expect(()=>read(outsider)).toThrow(/unavailable/);expect(()=>sql(auth(owner,'select * from dndkeep_private.propel_save_receipts'))).toThrow(/permission denied/);});
 test('failed save waits for a DM resistance decision without charging',()=>{sliver();legendary();expect(settle()).toMatchObject({pendingResistance:true,finalOutcome:null,record:{outcome:null}});expect(energy()).toBe('2');expect(()=>decide(true,owner)).toThrow(/Only this campaign DM/);expect(read().pendingResistance).toBe(true);});
 test('accepting the lair-only charge overrides failure and spends no Energy Die',()=>{
  const effect=sliver();legendary();settle();const r=decide(true);expect(r).toMatchObject({save:{outcome:'failed',total:9},accepted:true,finalOutcome:'passed',pendingResistance:false,record:{outcome:'passed',save_details:null,result:{energyCost:0}}});
  expect(consumed(effect)).toBe(id);expect(energy()).toBe('2');expect(sql(`select legendary_resistance_used from combat_participants where id='${target}'`)).toBe('4');
  expect(decide(true)).toEqual(r);expect(()=>decide(false)).toThrow(/already decided differently/);expect(sql(`select count(*) from combat_events where chain_id='${id}' and event_type='legendary_resistance_used'`)).toBe('1');
 });
 test('declining resistance charges once and retains the failed dice',()=>{sliver();legendary();settle();expect(decide(false)).toMatchObject({accepted:false,finalOutcome:'failed',record:{result:{energyCost:1}}});decide(false);expect(energy()).toBe('1');expect(sql(`select legendary_resistance_used from combat_participants where id='${target}'`)).toBe('3');});
 test('legacy manual completion cannot bypass a pending resistance decision',()=>{sliver();legendary();settle();for(const outcome of ['passed','failed','cancelled'])expect(()=>sql(auth(owner,`select psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"${outcome}"}')`))).toThrow(/DM must decide/);expect(energy()).toBe('2');});
 test('exhausted resistance stays pending and can still be declined',()=>{sliver();legendary();settle();sql(`update combat_participants set legendary_resistance_used=4 where id='${target}'`);expect(()=>decide(true)).toThrow(/No Legendary/);expect(read().pendingResistance).toBe(true);expect(decide(false).finalOutcome).toBe('failed');});
 test('condition changes after a recorded save do not reroll a declined failure',()=>{sliver();legendary();settle();condition('Paralyzed');expect(decide(false)).toMatchObject({save:{d20:12,automaticFailure:false},finalOutcome:'failed'});});
 test('failed payment during a decline rolls back the decision',()=>{sliver();legendary();settle();sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);expect(()=>decide(false)).toThrow();expect(read()).toMatchObject({pendingResistance:true,accepted:null});expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('0');});
 test('changed target identity cannot receive the saved resistance decision',()=>{sliver();legendary();settle();sql(`update combat_participants set entity_id='${randomUUID()}' where id='${target}'`);expect(()=>decide(true)).toThrow(/target changed/);expect(read().pendingResistance).toBe(true);expect(energy()).toBe('2');});
 test('ending the encounter prevents a resistance charge',()=>{sliver();legendary();settle();sql(`update combat_encounters set status='ended' where id='${encounter}'`);expect(()=>decide(true)).toThrow(/no longer active/);expect(sql(`select legendary_resistance_used from combat_participants where id='${target}'`)).toBe('3');});
 test('missing buff evidence rejects before consuming the penalty',()=>{const effect=sliver();sql(`update combatants set active_buffs='[{"key":"bless","saveBonus":"1d4"}]' where id=(select combatant_id from combat_participants where id='${target}')`);expect(()=>settle()).toThrow(/buff contributions changed/);expect(consumed(effect)).toBe('unused');expect(read()).toBeNull();});
 test('concurrent identical resistance decisions use only one charge',async()=>{sliver();legendary();settle();const q=auth(dm,`select decide_propel_resistance('${character}','${id}',true)`);const results=await Promise.all([parallel(q),parallel(q)]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(JSON.parse(results[0].out)).toEqual(JSON.parse(results[1].out));expect(sql(`select legendary_resistance_used from combat_participants where id='${target}'`)).toBe('4');expect(energy()).toBe('2');});
 for(const outcome of ['passed','failed'])test(`legacy ${outcome} cannot skip a combat save or its next-save effect`,()=>{
  const effect=sliver();legendary();
  const manual={participantId:target,outcome,dc:10};
  const face=outcome==='passed'?20:1,rolled={...manual,d20:face,bonus:0,total:face,rolls:[face],advantage:false,naturalExtremes:false};
  for(const save of [null,manual,rolled])expect(()=>sql(auth(owner,`select psionic_propel('${character}','finish','${JSON.stringify({declarationId:id,outcome,save})}')`))).toThrow(/requires its recorded saving throw/);
  expect(consumed(effect)).toBe('unused');expect(energy()).toBe('2');expect(read()).toBeNull();
  expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('0');expect(settle().pendingResistance).toBe(true);
 });
 test('cancel before recording a save keeps the action spent without consuming Mind Sliver',()=>{
  const effect=sliver(),result=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"cancelled"}')`)));
  expect(result).toMatchObject({outcome:'cancelled',result:{energyCost:0}});expect(consumed(effect)).toBe('unused');expect(energy()).toBe('2');expect(sql(`select bonus_used from combat_participants where id='${caster}'`)).toBe('t');
 });
 test('completed older records replay without requiring a new save receipt',()=>{
  const r=settle([1]);sql(`delete from dndkeep_private.propel_save_receipts where declaration_id='${id}'`);
  const result=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','finish','${JSON.stringify({declarationId:id,outcome:'failed',save:r.record.save_details})}')`)));
  expect(result).toMatchObject({outcome:'failed',replayed:true});expect(energy()).toBe('1');expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('1');
 });
 test('solo tabletop saves retain explicit manual resolution',()=>{
  sql(`update characters set campaign_id=null where id='${character}'`);
  const solo=randomUUID(),turn=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','context')`))).turnId;
  const payload={requestId:solo,turnId:turn,mode:'powered',movement:'push',roll:3,target:{name:'Tabletop creature',legalTargetConfirmed:true}};
  sql(auth(owner,`select psionic_propel('${character}','begin','${JSON.stringify(payload)}');select psionic_propel('${character}','finalize','{"declarationId":"${solo}"}')`));
  expect(JSON.parse(sql(auth(owner,`select psionic_propel('${character}','finish','{"declarationId":"${solo}","outcome":"failed"}')`)))).toMatchObject({outcome:'failed',result:{energyCost:1}});expect(energy()).toBe('1');
 });
 test('competing roll submissions return the first receipt and charge once',async()=>{sliver();const expected=context();const results=await Promise.all([parallel(auth(owner,command([12],3,expected))),parallel(auth(owner,command([1],4,expected)))]);expect(results.map(r=>r.code)).toEqual([0,0]);const [a,b]=results.map(r=>JSON.parse(r.out));expect(a.save).toEqual(b.save);expect(energy()).toBe('1');expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');});
});
