// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),roll:vi.fn(),session:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth:{getSession:m.session,onAuthStateChange:m.subscribe}}}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('../../rules/dice',()=>({rollDiceExpr:m.roll}));
import {processCurrentUserTurnEffects,processSavedTurnEffects,runTurnEffects,savedTurnEffect,savedTurnEffects,readTurnEffect,type TurnEffectPlan} from './turnEffects';
const id=(n:number)=>`${n}${'0'.repeat(7)}-0000-4000-8000-000000000000`;
const user=id(1),i={participantId:id(2),encounterId:id(3),turnId:id(4),timing:'turn_end' as const};
const expected={current_hp:40,max_hp:50,temp_hp:6,death_save_failures:0,death_save_successes:0,is_stable:false,is_dead:false,active_buffs:[{key:'acid',turnTick:{kind:'damage',timing:'turn_end',flat:10}}]};
const plan:TurnEffectPlan={combatantId:id(5),expected,updates:{current_hp:36,temp_hp:0,death_save_failures:0,death_save_successes:0,is_stable:false,is_dead:false,active_buffs:[]},events:[{eventType:'damage_applied',payload:{amount:10}}]};
const receipt=(requestId=id(6))=>({...i,requestId,combatantId:plan.combatantId,state:{...plan.updates,max_hp:50},eventCount:1,replayed:false});
beforeEach(()=>{vi.resetAllMocks();
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_key:string,_options:unknown,run:()=>unknown)=>Promise.resolve().then(run)}});
 m.session.mockResolvedValue({data:{session:{user:{id:user}}},error:null});m.subscribe.mockReturnValue({data:{subscription:{unsubscribe:m.unsubscribe}}});localStorage.clear();m.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='read_turn_effect_batch'?null:receipt(args.p_request as string));});
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

const freshContext=()=>({...i,userId:user,combatantId:plan.combatantId,isCharacter:true,state:{...expected,
 active_buffs:[{key:'acid',name:'Acid',source:'spell',turnTick:{kind:'damage',timing:'turn_end',dice:'1d6',flat:2,oneShot:true}}]}});
function preparedRpc(context:unknown=freshContext()){
 m.roll.mockReturnValue({total:4,rolls:[4],modifier:0});
 m.rpc.mockImplementation(async(name,args)=>{
  if(name==='read_turn_effect_batch')return null;
  if(name==='get_turn_effect_context')return context;
  return {...receipt(args.p_request),state:{...args.p_updates,max_hp:50},eventCount:args.p_events.length};
 });
}
it('prepares canonical dice from authorized context and persists the complete computed proposal',async()=>{
 preparedRpc();const guard=vi.fn();const r=await processSavedTurnEffects(user,i,guard);
 expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(['read_turn_effect_batch','get_turn_effect_context','commit_turn_effect_batch']);
 expect(m.roll.mock.calls).toEqual([['1d6']]);expect(guard.mock.calls.length).toBeGreaterThanOrEqual(3);
 expect(r.state).toMatchObject({current_hp:40,temp_hp:0,active_buffs:[]});expect(r.eventCount).toBe(2);
 expect(m.rpc.mock.calls[2][1].p_expected).toEqual(freshContext().state);
});
it('does not load context or roll when an authoritative receipt already exists',async()=>{
 m.rpc.mockResolvedValue({...receipt(),replayed:true});await processSavedTurnEffects(user,i,()=>{});
 expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.roll).not.toHaveBeenCalled();
});
it('failed commits retain computed dice and reuse them without another context read',async()=>{
 preparedRpc();const implementation=m.rpc.getMockImplementation()!;let failures=1;
 m.rpc.mockImplementation(async(name,args)=>{if(name==='commit_turn_effect_batch'&&failures-->0)throw new Error('offline');return implementation(name,args);});
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('offline');
 const saved=savedTurnEffect(user,i);expect(saved?.events[0].payload.amount).toBe(6);
 await processSavedTurnEffects(user,i,()=>{});expect(m.roll).toHaveBeenCalledTimes(1);
 expect(m.rpc.mock.calls.filter(([name])=>name==='get_turn_effect_context')).toHaveLength(1);
});
it('a scope change while context loads prevents all effect dice and submissions',async()=>{
 preparedRpc();let current=true;const impl=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation(async(name,args)=>{if(name==='get_turn_effect_context')current=false;return impl(name,args);});
 await expect(processSavedTurnEffects(user,i,()=>{if(!current)throw new Error('Sheet changed');})).rejects.toThrow('Sheet changed');
 expect(m.roll).not.toHaveBeenCalled();expect(savedTurnEffect(user,i)).toBeNull();
});
it.each(['userId','participantId','encounterId','turnId','combatantId'])('rejects mismatched or malformed %s before rolling',async field=>{
 preparedRpc({...freshContext(),[field]:field==='combatantId'?'bad':id(9)});
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('could not be verified');expect(m.roll).not.toHaveBeenCalled();
 expect(m.rpc).toHaveBeenCalledTimes(2);
});
it('validates all effect shapes before rolling the first one',async()=>{
 const c=freshContext();preparedRpc({...c,state:{...c.state,active_buffs:[...c.state.active_buffs,{key:'bad',name:'Bad',turnTick:{kind:'wrong',timing:'turn_end'}}]}});
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('could not be verified');expect(m.roll).not.toHaveBeenCalled();
});
it('context errors stop preparation without saving a new request',async()=>{
 m.rpc.mockImplementation(async name=>{if(name==='read_turn_effect_batch')return null;throw new Error('Turn changed');});
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('Turn changed');expect(m.roll).not.toHaveBeenCalled();expect(savedTurnEffect(user,i)).toBeNull();
});

it('retains an interruption marker if the final proposal write fails after dice',async()=>{
 preparedRpc();const original=localStorage.setItem.bind(localStorage);
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k.startsWith('dndkeep:turn-effects:')&&JSON.parse(v).events)throw new Error('Storage full');original(k,v);});
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('Storage full');expect(m.roll).toHaveBeenCalledTimes(1);
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('could not be verified');expect(m.roll).toHaveBeenCalledTimes(1);
 expect(m.rpc.mock.calls.some(([name])=>name==='commit_turn_effect_batch')).toBe(false);
});
it('blocked browser locking does not prepare or submit',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});preparedRpc();
 await expect(processSavedTurnEffects(user,i,()=>{})).rejects.toThrow('browser locking');expect(m.rpc).not.toHaveBeenCalled();expect(m.roll).not.toHaveBeenCalled();
});
it('the live adapter binds the saved batch to the session and releases its listener',async()=>{
 preparedRpc();expect((await processCurrentUserTurnEffects(i)).state.current_hp).toBe(40);expect(m.unsubscribe).toHaveBeenCalledTimes(1);
});
it('sign-out during receipt lookup prevents preparation and cleans up the listener',async()=>{
 preparedRpc();const original=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation(async(name,args)=>{if(name==='read_turn_effect_batch')m.subscribe.mock.calls[0][0]('SIGNED_OUT',null);return original(name,args);});
 await expect(processCurrentUserTurnEffects(i)).rejects.toThrow('Sign-in changed');expect(m.roll).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.unsubscribe).toHaveBeenCalledTimes(1);
});
it('a session switch while loading the session never resolves another account’s batch',async()=>{
 m.session.mockImplementation(async()=>{m.subscribe.mock.calls[0][0]('SIGNED_IN',{user:{id:id(8)}});return {data:{session:{user:{id:user}}},error:null};});
 await expect(processCurrentUserTurnEffects(i)).rejects.toThrow('Sign-in changed');expect(m.rpc).not.toHaveBeenCalled();expect(m.unsubscribe).toHaveBeenCalledTimes(1);
});
it('a scope change while a saved batch submits keeps its recovery request',async()=>{
 preparedRpc();let current=true;const original=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation(async(name,args)=>{if(name==='commit_turn_effect_batch')current=false;return original(name,args);});
 await expect(processSavedTurnEffects(user,i,()=>{if(!current)throw new Error('Scope changed');})).rejects.toThrow('Scope changed');expect(savedTurnEffect(user,i)).not.toBeNull();
});
