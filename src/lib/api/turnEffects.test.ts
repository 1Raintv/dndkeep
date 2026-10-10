// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
import {runTurnEffects,savedTurnEffect,savedTurnEffects,readTurnEffect,type TurnEffectPlan} from './turnEffects';
const id=(n:number)=>`${n}${'0'.repeat(7)}-0000-4000-8000-000000000000`;
const user=id(1),i={participantId:id(2),encounterId:id(3),turnId:id(4),timing:'turn_end' as const};
const expected={current_hp:40,max_hp:50,temp_hp:6,death_save_failures:0,death_save_successes:0,is_stable:false,is_dead:false,active_buffs:[{key:'acid',turnTick:{kind:'damage',timing:'turn_end',flat:10}}]};
const plan:TurnEffectPlan={combatantId:id(5),expected,updates:{current_hp:36,temp_hp:0,death_save_failures:0,death_save_successes:0,is_stable:false,is_dead:false,active_buffs:[]},events:[{eventType:'damage_applied',payload:{amount:10}}]};
const receipt=(requestId=id(6))=>({...i,requestId,combatantId:plan.combatantId,state:{...plan.updates,max_hp:50},eventCount:1,replayed:false});
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();m.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='read_turn_effect_batch'?null:receipt(args.p_request as string));});
afterEach(()=>vi.restoreAllMocks());
it('persists the full original outcome before submitting',async()=>{
 const prepare=vi.fn(async()=>plan);m.rpc.mockImplementation(async(name,args)=>{
  if(name==='read_turn_effect_batch')return null;
  expect(savedTurnEffect(user,i)).toMatchObject({requestId:args.p_request,expected:plan.expected,updates:plan.updates,events:plan.events});return receipt(args.p_request);
 });
 await runTurnEffects(user,i,prepare);expect(prepare).toHaveBeenCalledTimes(1);expect(savedTurnEffect(user,i)).toBeNull();
});
it('a lost reply keeps the same request and does not prepare more dice on retry',async()=>{
 let commit=0;m.rpc.mockImplementation(async(name,args)=>{if(name==='read_turn_effect_batch')return null;if(commit++===0)throw new Error('reply lost');return receipt(args.p_request);});
 const prepare=vi.fn(async()=>plan);await expect(runTurnEffects(user,i,prepare)).rejects.toThrow('reply lost');const saved=savedTurnEffect(user,i)!;
 expect(saved).toBeTruthy();await runTurnEffects(user,i,prepare);expect(prepare).toHaveBeenCalledTimes(1);
 const calls=m.rpc.mock.calls.filter(([name])=>name==='commit_turn_effect_batch');expect(calls[0]).toEqual(calls[1]);expect(savedTurnEffect(user,i)).toBeNull();
});
it('reads a completed server batch before rolling, including a winner from another tab',async()=>{
 const r={...receipt(),replayed:true};m.rpc.mockResolvedValue(r);const prepare=vi.fn(async()=>plan);
 expect(await runTurnEffects(user,i,prepare)).toEqual(r);expect(prepare).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('simultaneous retries in one tab share one submission',async()=>{
 const prepare=vi.fn(async()=>plan),a=runTurnEffects(user,i,prepare),b=runTurnEffects(user,i,prepare);expect(a).toBe(b);await a;expect(prepare).toHaveBeenCalledTimes(1);expect(m.rpc).toHaveBeenCalledTimes(2);
});
it('blocked storage prevents preparing effect dice or submitting damage',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});const prepare=vi.fn(async()=>plan);
 await expect(runTurnEffects(user,i,prepare)).rejects.toThrow('storage blocked');expect(prepare).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('unknown receipt reads leave existing saved effects untouched',async()=>{
 m.rpc.mockImplementation(async name=>{if(name==='read_turn_effect_batch')return null;throw new Error('offline');});const prepare=vi.fn(async()=>plan);
 await expect(runTurnEffects(user,i,prepare)).rejects.toThrow();const saved=savedTurnEffect(user,i);
 m.rpc.mockRejectedValue(new Error('read failed'));await expect(runTurnEffects(user,i,prepare)).rejects.toThrow('read failed');expect(savedTurnEffect(user,i)).toEqual(saved);expect(prepare).toHaveBeenCalledTimes(1);
});
it('malformed acknowledgements stay recoverable',async()=>{
 m.rpc.mockImplementation(async name=>name==='read_turn_effect_batch'?null:{...receipt(),state:{...receipt().state,current_hp:35}});
 await expect(runTurnEffects(user,i,async()=>plan)).rejects.toThrow('could not be verified');expect(savedTurnEffect(user,i)).not.toBeNull();
});
it('invalid plans cannot write a request or reach the commit RPC',async()=>{
 await expect(runTurnEffects(user,i,async()=>({...plan,updates:{...plan.updates,temp_hp:-1}}))).rejects.toThrow('could not be verified');expect(savedTurnEffect(user,i)).toBeNull();expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('scopes pending requests to user, encounter, participant, turn and timing',async()=>{
 m.rpc.mockImplementation(async name=>{if(name==='read_turn_effect_batch')return null;throw new Error('offline');});await expect(runTurnEffects(user,i,async()=>plan)).rejects.toThrow();
 expect(savedTurnEffects(user,i.encounterId)).toHaveLength(1);expect(savedTurnEffects(id(7),i.encounterId)).toEqual([]);expect(savedTurnEffect(user,{...i,timing:'turn_start'})).toBeNull();expect(savedTurnEffects(user,id(8))).toEqual([]);
});
it('unreadable local proposals never lead to another roll',async()=>{
 const k=`dndkeep:turn-effects:${user}:${i.encounterId}:${i.participantId}:${i.turnId}:${i.timing}`;localStorage.setItem(k,'broken');const prepare=vi.fn(async()=>plan);
 await expect(runTurnEffects(user,i,prepare)).rejects.toThrow('could not be verified');expect(prepare).not.toHaveBeenCalled();expect(localStorage.getItem(k)).toBe('broken');
});
it('cleanup failure does not hide a committed receipt',async()=>{
 const prepare=vi.fn(async()=>plan);let calls=0;const original=localStorage.removeItem.bind(localStorage);
 vi.spyOn(localStorage,'removeItem').mockImplementation(k=>{if(calls++>0)throw new Error('cleanup blocked');original(k);});
 const r=await runTurnEffects(user,i,prepare);expect(r.state.current_hp).toBe(36);expect(savedTurnEffect(user,i)).not.toBeNull();
});
it('receipt readers reject a different target or turn',async()=>{
 m.rpc.mockResolvedValue({...receipt(),turnId:id(9)});await expect(readTurnEffect(i)).rejects.toThrow('could not be verified');
});
it('JSONB key order does not invalidate the acknowledgement',async()=>{
 const withBuff={...plan,updates:{...plan.updates,active_buffs:[{name:'Kept',key:'keep'}]}};
 m.rpc.mockImplementation(async(name,args)=>name==='read_turn_effect_batch'?null:{...receipt(args.p_request),state:{...withBuff.updates,max_hp:50,active_buffs:[{key:'keep',name:'Kept'}]}});
 expect((await runTurnEffects(user,i,async()=>withBuff)).state.active_buffs).toEqual([{key:'keep',name:'Kept'}]);
});
