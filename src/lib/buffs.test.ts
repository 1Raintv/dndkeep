import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({part:{} as Record<string,unknown>,updates:[] as Record<string,unknown>[],event:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:()=>({
 select:()=>({eq:()=>({maybeSingle:async()=>({data:m.part,error:null})})}),
 update:(patch:Record<string,unknown>)=>({eq:async()=>{m.updates.push(patch);return {error:null};}})
})}}));
vi.mock('./api/checked',()=>({checkedWrite:async(_op:unknown,_ctx:unknown,q:Promise<unknown>)=>await q}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'',normalizeParticipantRow:(v:unknown)=>v}));
import {processTurnTicks} from './buffs';
const tick=(amount:number)=>({key:'acid',name:'Delayed acid',turnTick:{kind:'damage',timing:'turn_end',flat:amount,oneShot:true}});
beforeEach(()=>{vi.clearAllMocks();m.updates=[];m.part={id:'participant',combatant_id:'combatant',name:'Hero',participant_type:'character',campaign_id:'campaign',current_hp:0,max_hp:20,temp_hp:6,death_save_failures:0,death_save_successes:0,is_stable:true,is_dead:false,active_buffs:[tick(5)]};});
const run=()=>processTurnTicks({participantId:'participant',encounterId:'encounter',timing:'turn_end'});
describe('turn damage at zero HP',()=>{
 it('consumes temporary HP, breaks stability and records one failure',async()=>{
  await run();expect(m.updates).toEqual([expect.objectContaining({current_hp:0,temp_hp:1,death_save_failures:1,is_stable:false,active_buffs:[]})]);
  expect(m.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'damage_at_0_hp_failure_added',payload:expect.objectContaining({amount:5,temp_hp_after:1,failures:1,became_dead:false})}));
 });
 it.each([0,30])('a maximum-sized hit kills at zero even with %s temporary HP',async temp=>{
  m.part.temp_hp=temp;m.part.active_buffs=[tick(20)];await run();
  expect(m.updates[0]).toMatchObject({current_hp:0,temp_hp:Math.max(0,temp-20),death_save_failures:3,is_dead:true});
  expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({massive_damage_death:true})}));
 });
 it('third failure kills without mislabeling ordinary damage as massive',async()=>{
  m.part.death_save_failures=2;await run();expect(m.updates[0]).toMatchObject({death_save_failures:3,is_dead:true});
  expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({massive_damage_death:false})}));
 });
 it('does not heal a creature killed by the earlier tick',async()=>{
  m.part.active_buffs=[tick(20),{key:'heal',name:'Healing',turnTick:{kind:'heal',timing:'turn_end',flat:1}}];await run();
  expect(m.updates[0]).toMatchObject({current_hp:0,is_dead:true});expect(m.event.mock.calls.some(([e])=>e.eventType==='healing_applied')).toBe(false);
 });
 it('retains temp-first massive damage handling for a creature above zero',async()=>{
  m.part.current_hp=5;m.part.temp_hp=2;m.part.active_buffs=[tick(27)];await run();
  expect(m.updates[0]).toMatchObject({current_hp:0,temp_hp:0,is_dead:true,death_save_failures:3});
 });
});
