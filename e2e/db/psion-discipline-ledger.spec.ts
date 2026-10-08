import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null;out:string;error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Shared Psionic Discipline turns',()=>{
 gateDbSuite();let owner:string,other:string,char:string;
 test.beforeEach(()=>{owner=randomUUID();other=randomUUID();char=randomUUID();sql(`begin;
  insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@discipline.local','{}'),('${other}','${other}@discipline.local','{}');
  insert into characters(id,user_id,name,species,class_name,background,level,intelligence,class_resources)
  values('${char}','${owner}','Discipline fixture','Human','Psion','Sage',5,18,'{"psionic-energy-dice":6,"psion-disciplines":["Biofeedback","Destructive Thoughts","Inerrant Aim","psionic-guards","Sharpened Mind"],"other":7}');commit;`);});
 test.afterEach(()=>sql(`delete from action_logs where character_id='${char}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${other}');`));
 const snapshot=()=>sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`);
 const begin=(discipline='biofeedback',id=randomUUID(),turn='{"soloTurn":0}',count=1,rolls='array[3]',expected=snapshot())=>`select begin_psionic_discipline('${char}','${id}','${turn}','${discipline}',${rolls}::integer[],${count},4,'${expected}')`;
 const run=(q:string,u=owner)=>JSON.parse(sql(auth(u,q)));
 const finish=(id:string,changed:boolean)=>`select finish_psionic_discipline('${char}','${id}',${changed})`;
 const pool=()=>Number(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`));
 const state=()=>run(`select get_psionic_discipline_turn('${char}')`);
 // v2.816 — real combat order, with a separate creature before the Psion.
 function withCombat(check:(fixture:{encounter:string;creature:string;creatureParticipant:string;hero:string})=>void){
  const campaign=randomUUID(),encounter=randomUUID(),hero=randomUUID(),creature=randomUUID(),creatureParticipant=randomUUID();
  try{
   sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Own-turn fixture');
    update characters set campaign_id='${campaign}' where id='${char}';
    insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,is_dead) values
     ('${hero}','${campaign}','${owner}','Psion','character','${char}',20,20,false),
     ('${creature}','${campaign}','${other}','Creature','srd_monster','fixture',10,10,false);
    insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values
     ('${creatureParticipant}','${encounter}','${campaign}','creature','fixture','Creature',0,'${creature}'),
     (gen_random_uuid(),'${encounter}','${campaign}','character','${char}','Psion',1,'${hero}');`);
   check({encounter,creature,creatureParticipant,hero});
  }finally{sql(`delete from campaigns where id='${campaign}'`);}
 }
 for(const discipline of ['psionic-guards','sharpened-mind'])test(`${discipline} requires its owners combat turn but replays a paid use after advancing`,()=>withCombat(({encounter})=>{
  const rolls=discipline==='psionic-guards'?'array[]':'array[4]';
  const offTurn=begin(discipline,randomUUID(),JSON.stringify(state().turn),1,rolls);
  expect(()=>run(offTurn)).toThrow(/own turn/);expect(()=>run(offTurn,other)).toThrow(/own turn/);
  expect(pool()).toBe(6);expect(state().uses).toHaveLength(0);
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);
  const paid=begin(discipline,randomUUID(),JSON.stringify(state().turn),1,rolls);expect(run(paid,other).replayed).toBe(false);expect(pool()).toBe(5);
  sql(`update combat_encounters set current_turn_index=0,round_number=2 where id='${encounter}'`);
  expect(run(paid).replayed).toBe(true);expect(pool()).toBe(5);
 }));
 test('dead creatures are excluded before choosing the owners turn',()=>withCombat(({creature})=>{
  sql(`update combatants set is_dead=true where id='${creature}'`);
  expect(run(begin('psionic-guards',randomUUID(),JSON.stringify(state().turn),1,'array[]')).replayed).toBe(false);
 }));
 test('zero HP without death and hidden creatures still occupy their turns',()=>withCombat(({creature,creatureParticipant})=>{
  sql(`update combatants set current_hp=0,is_dead=false where id='${creature}';update combat_participants set hidden_from_players=true where id='${creatureParticipant}'`);
  expect(()=>run(begin('psionic-guards',randomUUID(),JSON.stringify(state().turn),1,'array[]'))).toThrow(/own turn/);expect(pool()).toBe(6);
 }));
 test('legacy orphan recovery uses the combatants death state',()=>withCombat(({creature,hero,encounter})=>{
  sql(`update combatants set is_dead=true where id in('${creature}','${hero}');update combat_participants set combatant_id=null where encounter_id='${encounter}' and entity_id='${char}'`);
  expect(()=>run(begin('sharpened-mind',randomUUID(),JSON.stringify(state().turn)))).toThrow(/own turn/);
  sql(`update combatants set is_dead=false where id='${hero}'`);
  expect(run(begin('sharpened-mind',randomUUID(),JSON.stringify(state().turn))).replayed).toBe(false);
 }));
 test('an out-of-range actor cannot claim a start-of-turn exception',()=>withCombat(({encounter})=>{
  sql(`update combat_encounters set current_turn_index=99 where id='${encounter}'`);
  expect(()=>run(begin('psionic-guards',randomUUID(),JSON.stringify(state().turn),1,'array[]'))).toThrow(/own turn/);expect(pool()).toBe(6);
 }));
 test('ordinary triggered disciplines remain available on another creatures turn',()=>withCombat(()=>{
  expect(run(begin('inerrant-aim',randomUUID(),JSON.stringify(state().turn))).conditional).toBe(true);expect(pool()).toBe(6);
 }));
 test('one paid discipline owns the turn and retry returns current resources without another charge',()=>{
  const id=randomUUID(),q=begin('biofeedback',id);expect(run(q)).toMatchObject({replayed:false,discipline:'biofeedback',rolls:[3],energy:{remaining:5}});expect(pool()).toBe(5);
  expect(()=>run(begin('destructive-thoughts'))).toThrow(/already used/);expect(()=>run(begin('biofeedback'))).toThrow(/already used/);
  sql(`update characters set class_resources=jsonb_set(class_resources,'{psionic-energy-dice}','4') where id='${char}'`);
  expect(run(q)).toMatchObject({replayed:true,character:{class_resources:{'psionic-energy-dice':4}}});expect(pool()).toBe(4);expect(state().uses).toHaveLength(1);
 });
 test('an unsuccessful conditional bonus keeps its die but consumes its turn use',()=>{
  const id=randomUUID();expect(run(begin('inerrant-aim',id))).toMatchObject({conditional:true,energy:null,outcome:null});expect(pool()).toBe(6);expect(state().pending).toHaveLength(1);
  expect(run(finish(id,false))).toMatchObject({outcome:{spent:false}});expect(pool()).toBe(6);expect(state().pending).toHaveLength(0);
  expect(()=>run(begin('biofeedback'))).toThrow(/already used/);expect(()=>run(begin('inerrant-aim'))).toThrow(/already used/);expect(run(finish(id,false)).replayed).toBe(true);expect(()=>run(finish(id,true))).toThrow(/outcome changed/);
 });
 test('a successful conditional outcome charges once after concurrent confirmations',async()=>{
  const id=randomUUID();run(begin('inerrant-aim',id));const q=auth(owner,finish(id,true));const results=await Promise.all([parallel(q),parallel(q)]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(pool()).toBe(5);
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
 });
 test('competing tabs cannot begin two ordinary disciplines in one turn',async()=>{
  const results=await Promise.all([parallel(auth(owner,begin())),parallel(auth(owner,begin('destructive-thoughts')))]);expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('already used');expect(pool()).toBe(5);
 });
 test('same begin identity from two tabs pays once',async()=>{
  const q=auth(owner,begin());const results=await Promise.all([parallel(q),parallel(q)]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(pool()).toBe(5);
 });
 for(const discipline of ['psionic-guards','sharpened-mind'])test(`${discipline} permits another distinct discipline, not a repeat`,()=>{
  run(begin(discipline,randomUUID(),'{"soloTurn":0}',1,discipline==='psionic-guards'?'array[]':'array[4]'));run(begin());expect(pool()).toBe(4);expect(()=>run(begin('destructive-thoughts'))).toThrow(/already used/);expect(()=>run(begin(discipline))).toThrow();
 });
 test('both distinct start-of-turn exceptions leave room for one ordinary discipline',()=>{
  run(begin('psionic-guards',randomUUID(),'{"soloTurn":0}',1,'array[]'));run(begin('sharpened-mind'));run(begin());expect(state().uses).toHaveLength(3);expect(pool()).toBe(3);expect(()=>run(begin('destructive-thoughts'))).toThrow(/already used/);
 });
 test('start-of-turn exceptions cannot be retrofitted after an ordinary discipline',()=>{
  run(begin());expect(()=>run(begin('psionic-guards',randomUUID(),'{"soloTurn":0}',1,'array[]'))).toThrow(/start-of-turn/);
 });
 test('new solo turns allow another use while old pending outcomes remain recoverable',()=>{
  const id=randomUUID();run(begin('inerrant-aim',id));run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);expect(state().uses).toHaveLength(0);expect(state().pending).toHaveLength(1);
  expect(()=>run(begin())).toThrow(/Turn changed/);run(begin('biofeedback',randomUUID(),'{"soloTurn":1}'));run(finish(id,false));expect(pool()).toBe(5);expect(state().pending).toHaveLength(0);
 });
 test('rejects changed payload, unknown choice, unlearned choice and stale ability snapshot',()=>{
  expect(()=>run(begin('unknown'))).toThrow(/Unknown/);expect(()=>run(begin('observant-mind'))).toThrow(/Choose/);const old=snapshot();sql(`update characters set intelligence=20 where id='${char}'`);expect(()=>run(begin('biofeedback',randomUUID(),'{"soloTurn":0}',1,'array[3]',old))).toThrow(/abilities changed/);
  const id=randomUUID();run(begin('biofeedback',id));expect(()=>run(begin('biofeedback',id,'{"soloTurn":0}',1,'array[4]'))).toThrow(/request changed/);
 });
 for(const [count,rolls] of [[0,'array[]'],[2,'array[3]'],[1,'array[9]'],[5,'array[1,1,1,1,1]']])test(`rejects invalid count/rolls ${count} ${rolls}`,()=>{
  expect(()=>run(begin('biofeedback',randomUUID(),'{"soloTurn":0}',Number(count),String(rolls)))).toThrow(/Invalid discipline dice/);expect(pool()).toBe(6);expect(state().uses).toHaveLength(0);
 });
 test('requires a die even for a conditional attempt and supports secondary Psion progression',()=>{
  sql(`update characters set class_name='Fighter',level=11,secondary_class='Psion',secondary_level=5 where id='${char}'`);run(begin('inerrant-aim'));expect(pool()).toBe(6);
  run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);sql(`update characters set class_resources=jsonb_set(class_resources,'{psionic-energy-dice}','0') where id='${char}'`);expect(()=>run(begin('inerrant-aim',randomUUID(),'{"soloTurn":1}'))).toThrow(/Invalid discipline dice/);
 });
 test('denies another user and direct ledger access',()=>{
  expect(()=>run(begin(),other)).toThrow();expect(()=>run(`select get_psionic_discipline_turn('${char}')`,other)).toThrow();expect(()=>sql(auth(owner,'select * from dndkeep_private.psionic_discipline_uses'))).toThrow(/permission denied/);expect(pool()).toBe(6);
 });
 test('failed history atomically rolls back the turn claim and Energy Dice payment',()=>{
  const name='discipline_test_'+char.replaceAll('-','');try{
   sql(`create function public.${name}() returns trigger language plpgsql as $$begin if new.character_id='${char}' then raise exception 'injected discipline history failure';end if;return new;end;$$;create trigger ${name} before insert on character_history for each row execute function public.${name}()`);
   expect(()=>run(begin())).toThrow(/injected discipline history/);expect(pool()).toBe(6);expect(state().uses).toHaveLength(0);expect(sql(`select count(*) from psionic_energy_uses where character_id='${char}'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${name} on character_history;drop function if exists public.${name}()`);}
 });
 test('campaign turns share DM/player usage and cannot reuse an old turn after rewind',()=>{
  const campaign=randomUUID(),encounter=randomUUID(),participant=randomUUID();try{
   sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Discipline combat');update characters set campaign_id='${campaign}' where id='${char}';
    insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Discipline fixture',0)`);
   const turn=JSON.stringify(state().turn);run(begin('inerrant-aim',randomUUID(),turn));expect(()=>run(begin('biofeedback',randomUUID(),turn),other)).toThrow(/already used/);
   sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);const next=JSON.stringify(state().turn);run(begin('inerrant-aim',randomUUID(),next),other);
   sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);expect(JSON.stringify(state().turn)).not.toBe(turn);expect(()=>run(begin('biofeedback',randomUUID(),turn))).toThrow(/Turn changed/);
  }finally{sql(`delete from campaigns where id='${campaign}'`);}
 });
 test('anonymous access and below-level uses are rejected',()=>{
  expect(()=>sql(`begin;set local role anon;select get_psionic_discipline_turn('${char}');commit`)).toThrow(/permission denied/);
  sql(`update characters set level=1 where id='${char}'`);expect(()=>run(begin())).toThrow(/Psion level 2/);expect(pool()).toBe(6);
 });
 test('cannot retrofit an unrelated existing Energy payment into a discipline use',()=>{
  const id=randomUUID();run(`select settle_psionic_energy('${char}','${id}','spend',1,array[3],'Biofeedback')`);expect(()=>run(begin('biofeedback',id))).toThrow(/identity is already/);expect(state().uses).toHaveLength(0);expect(pool()).toBe(5);
 });
 test('failed conditional-result history rolls back payment and preserves its pending outcome',()=>{
  const id=randomUUID(),name='discipline_finish_'+char.replaceAll('-','');run(begin('inerrant-aim',id));try{
   sql(`create function public.${name}() returns trigger language plpgsql as $$begin if new.character_id='${char}' and new.action_name='Inerrant Aim' then raise exception 'injected result history failure';end if;return new;end;$$;create trigger ${name} before insert on action_logs for each row execute function public.${name}()`);
   expect(()=>run(finish(id,true))).toThrow(/injected result history/);expect(pool()).toBe(6);expect(state().pending).toHaveLength(1);expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${name} on action_logs;drop function if exists public.${name}()`);}
  run(finish(id,true));expect(pool()).toBe(5);expect(state().pending).toHaveLength(0);
 });

});
