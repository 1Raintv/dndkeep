// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:m.rpc}}));
import {createStandaloneSaveRequest,queueStandaloneSave,savedStandaloneCreations,savedStandaloneRolls,rollStandaloneSave,confirmStandaloneRoll,cancelStandaloneCreation,loadStandaloneSaves,type StandaloneSaveOffer} from './standaloneConcentration';
const u='11111111-1111-4111-8111-111111111111',c='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',next='44444444-4444-4444-8444-444444444444';
const character={id:c,concentration_spell:'Fly',concentration_revision:4,concentration_slot_level:3,concentration_rounds_remaining:10,concentration_casting_context:null,
 constitution:14,inventory:[],level:3,secondary_class:'Fighter',secondary_level:2,saving_throw_proficiencies:['constitution'],gained_feats:['War Caster'],nat_1_20_saves:false} as unknown as Character;
const row:StandaloneSaveOffer={request_id:id,character_id:c,spell_name:'Fly',casting_revision:4,damage:5,dc:10,save_bonus:5,has_advantage:true,natural_extremes:false,created_at:'2026-10-08T00:00:00Z',outcome:null};
const result={requestId:id,characterId:c,spell:'Fly',castingRevision:4,outcome:'passed',reason:'save',rolls:[3,17],d20:17,total:22,dc:10,bonus:5,advantage:true,replayed:false,character};
const request=()=>createStandaloneSaveRequest(character,u,5,2,id);
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();m.rpc.mockResolvedValue({data:{...row,replayed:false},error:null});});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('persists a captured creation before network I/O and clones caller state',async()=>{
 const source=structuredClone(character),r=createStandaloneSaveRequest(source,u,5,2,id);source.constitution=30;
 m.rpc.mockImplementation(async(_name,args)=>{expect(savedStandaloneCreations(u,c)).toEqual([r]);expect(args.p_expected.constitution).toBe(14);return {data:{...row,replayed:false},error:null};});
 expect((await queueStandaloneSave(r)).save_bonus).toBe(5);expect(savedStandaloneCreations(u,c)).toEqual([]);
});
it('lost creation responses retain and retry the exact identity',async()=>{
 const r=request();m.rpc.mockRejectedValue(new Error('Offline'));await expect(queueStandaloneSave(r)).rejects.toThrow('Offline');
 expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);expect(savedStandaloneCreations(u,c)).toEqual([r]);
 m.rpc.mockResolvedValue({data:{...row,replayed:true},error:null});await queueStandaloneSave(r);expect(savedStandaloneCreations(u,c)).toEqual([]);
});
it('multiple pending creations remain independent and account scoped',()=>{
 const first=request(),second=createStandaloneSaveRequest(character,u,12,2,next);
 expect(savedStandaloneCreations(u,c)).toEqual([first,second]);expect(savedStandaloneCreations(next,c)).toEqual([]);
});
it('stale creation rejection preserves recovery without repeated semantic calls',async()=>{
 const r=request();m.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Character changed'}});
 await expect(queueStandaloneSave(r)).rejects.toThrow('Character changed');expect(m.rpc).toHaveBeenCalledTimes(1);expect(savedStandaloneCreations(u,c)).toEqual([r]);
});
it.each([{...row,damage:7},{...row,save_bonus:2},{...row,has_advantage:false},{...row,casting_revision:5}])('rejects mismatched creation receipt %j',async data=>{
 const r=request();m.rpc.mockResolvedValue({data:{...data,replayed:false},error:null});await expect(queueStandaloneSave(r)).rejects.toThrow();expect(savedStandaloneCreations(u,c)).toEqual([r]);
});
it('only verified cancellation discards an unconfirmed creation',async()=>{
 const r=request();m.rpc.mockResolvedValue({data:{requestId:id,characterId:c,canceled:false,replayed:true},error:null});
 expect(await cancelStandaloneCreation(r)).toBe(false);expect(savedStandaloneCreations(u,c)).toEqual([r]);
 m.rpc.mockResolvedValue({data:{requestId:id,characterId:c,canceled:true,replayed:false},error:null});
 expect(await cancelStandaloneCreation(r)).toBe(true);expect(savedStandaloneCreations(u,c)).toEqual([]);
});
it('malformed cancellation cannot erase recovery',async()=>{
 const r=request();m.rpc.mockResolvedValue({data:{requestId:next,characterId:c,canceled:true,replayed:false},error:null});
 await expect(cancelStandaloneCreation(r)).rejects.toThrow('cancellation');expect(savedStandaloneCreations(u,c)).toEqual([r]);
});
it('stores both advantage dice before settlement and retries without rerolling',async()=>{
 const random=vi.spyOn(Math,'random').mockReturnValueOnce(.125).mockReturnValueOnce(.825);
 m.rpc.mockImplementation(async()=>{expect(savedStandaloneRolls(u,c)[0].rolls).toEqual([3,17]);throw new Error('Offline');});
 await expect(rollStandaloneSave(u,row)).rejects.toThrow('Offline');expect(random).toHaveBeenCalledTimes(2);
 const original=m.rpc.mock.calls[0][1];m.rpc.mockResolvedValue({data:{...result,replayed:true},error:null});
 expect((await rollStandaloneSave(u,row)).d20).toBe(17);expect(m.rpc.mock.calls[2][1]).toEqual(original);expect(random).toHaveBeenCalledTimes(2);expect(savedStandaloneRolls(u,c)).toEqual([]);
});
it('coalesces duplicate clicks into one settlement call',async()=>{
 vi.spyOn(Math,'random').mockReturnValue(.825);let finish!:(value:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=rollStandaloneSave(u,row),second=rollStandaloneSave(u,row);expect(first).toBe(second);expect(m.rpc).toHaveBeenCalledTimes(1);
 finish({data:{...result,rolls:[17,17]},error:null});await first;
});
it('accepts another device winning with a different valid pair',async()=>{
 vi.spyOn(Math,'random').mockReturnValue(.125);m.rpc.mockResolvedValue({data:{...result,replayed:true},error:null});
 expect((await rollStandaloneSave(u,row)).rolls).toEqual([3,17]);expect(savedStandaloneRolls(u,c)).toEqual([]);
});
it.each([{...result,total:40},{...result,d20:3,total:8},{...result,outcome:'failed'},{...result,character:{...character,id:next}}])('retains the original dice after malformed result %j',async data=>{
 vi.spyOn(Math,'random').mockReturnValue(.825);m.rpc.mockResolvedValue({data,error:null});await expect(rollStandaloneSave(u,row)).rejects.toThrow();expect(savedStandaloneRolls(u,c)).toHaveLength(1);
});
it('obsolete receipt never invents a roll or changes the current casting',async()=>{
 m.rpc.mockResolvedValue({data:{...result,outcome:'obsolete',reason:'casting_changed',rolls:null,d20:null,total:null,character:{...character,concentration_spell:'Invisibility',concentration_revision:5}},error:null});
 expect((await rollStandaloneSave(u,row)).character.concentration_spell).toBe('Invisibility');expect(savedStandaloneRolls(u,c)).toEqual([]);
});
it('malformed local recovery blocks rerolling and sending',()=>{
 localStorage.setItem(`dndkeep:solo-save:roll:${u}:${c}:${id}`,'bad');const random=vi.spyOn(Math,'random');
 expect(()=>rollStandaloneSave(u,row)).toThrow('unreadable');expect(random).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it('storage failure prevents a creation call',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});expect(request).toThrow('Storage full');expect(m.rpc).not.toHaveBeenCalled();
});
it('loads distinct pending offers and rejects duplicates or another character',async()=>{
 m.rpc.mockResolvedValue({data:{character,pending:[row]},error:null});expect((await loadStandaloneSaves(c)).pending).toEqual([row]);
 m.rpc.mockResolvedValue({data:{character,pending:[row,row]},error:null});await expect(loadStandaloneSaves(c)).rejects.toThrow('queue');
 m.rpc.mockResolvedValue({data:{character:{...character,id:next},pending:[]},error:null});await expect(loadStandaloneSaves(c)).rejects.toThrow('state');
});
it('an explicitly recovered roll preserves its first pair',async()=>{
 m.rpc.mockResolvedValue({data:result,error:null});const random=vi.spyOn(Math,'random');
 await confirmStandaloneRoll({userId:u,characterId:c,requestId:id,offer:row,rolls:[3,17]});expect(random).not.toHaveBeenCalled();
});

it('a hung creation times out without discarding it; late response cannot acknowledge recovery',async()=>{
 vi.useFakeTimers();const r=request();let finish!:(v:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=queueStandaloneSave(r),rejection=expect(first).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(15000);await rejection;
 expect(savedStandaloneCreations(u,c)).toEqual([r]);finish({data:{...row,replayed:false},error:null});await Promise.resolve();
 expect(savedStandaloneCreations(u,c)).toEqual([r]);m.rpc.mockResolvedValue({data:{...row,replayed:true},error:null});await queueStandaloneSave(r);expect(savedStandaloneCreations(u,c)).toEqual([]);
});
it('a hung roll can be retried with its original dice after the deadline',async()=>{
 vi.useFakeTimers();const random=vi.spyOn(Math,'random').mockReturnValueOnce(.125).mockReturnValueOnce(.825);
 m.rpc.mockImplementation(()=>new Promise(()=>{}));const first=rollStandaloneSave(u,row),rejection=expect(first).rejects.toThrow('timed out');
 await vi.advanceTimersByTimeAsync(15000);await rejection;expect(savedStandaloneRolls(u,c)[0].rolls).toEqual([3,17]);
 m.rpc.mockResolvedValue({data:{...result,replayed:true},error:null});await rollStandaloneSave(u,row);expect(random).toHaveBeenCalledTimes(2);
});

it('captures exhaustion and verifies its penalty only once',async()=>{
 const r=createStandaloneSaveRequest({...character,exhaustion_level:2},u,5,2,id);
 expect(r.expected.exhaustion_level).toBe(2);m.rpc.mockResolvedValue({data:{...row,save_bonus:1,replayed:false},error:null});
 expect((await queueStandaloneSave(r)).save_bonus).toBe(1);
});
it('rejects an offer that omitted the captured exhaustion penalty',async()=>{
 const r=createStandaloneSaveRequest({...character,exhaustion_level:2},u,5,2,id);
 await expect(queueStandaloneSave(r)).rejects.toThrow('does not match');expect(savedStandaloneCreations(u,c)).toEqual([r]);
});
it('old zero-exhaustion creation requests can still be replayed',async()=>{
 const r=request();delete r.expected.exhaustion_level;localStorage.clear();
 expect((await queueStandaloneSave(r)).save_bonus).toBe(5);
});
it('loads negative total bonuses caused by exhaustion',async()=>{
 m.rpc.mockResolvedValue({data:{character,pending:[{...row,save_bonus:-15}]},error:null});
 expect((await loadStandaloneSaves(c)).pending[0].save_bonus).toBe(-15);
});

it('an identical creation retry retains its effect dice before server confirmation',()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(0),c1={...character,active_buffs:[{name:'Bless'}]};
 const first=createStandaloneSaveRequest(c1,u,5,2,id);expect(createStandaloneSaveRequest(c1,u,5,2,id)).toEqual(first);expect(random).toHaveBeenCalledTimes(1);
 expect(first.modifier).toBe(3);expect(first.expected.active_buffs).toEqual(c1.active_buffs);
});

it('accepts server-snapshotted class advantage without a War Caster feat',async()=>{
 const r=createStandaloneSaveRequest({...character,gained_feats:[]},u,5,2,id);
 await expect(queueStandaloneSave(r)).resolves.toMatchObject({has_advantage:true});
});
it('still rejects missing advantage for a captured War Caster feat',async()=>{
 m.rpc.mockResolvedValue({data:{...row,has_advantage:false,replayed:false},error:null});
 await expect(queueStandaloneSave(request())).rejects.toThrow('does not match');
});
