// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:m.rpc}}));
import {createStandaloneDamage,savedStandaloneDamage,submitStandaloneDamage,cancelStandaloneDamage,type StandaloneDamageRequest} from './standaloneDamage';
const u='11111111-1111-4111-8111-111111111111',c='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const character={id:c,user_id:u,current_hp:20,max_hp:20,temp_hp:6,hit_point_revision:2,
 concentration_spell:'Fly',concentration_revision:4,concentration_slot_level:3,concentration_rounds_remaining:10,concentration_casting_context:null,
 constitution:14,inventory:[],level:3,secondary_class:'Fighter',secondary_level:2,saving_throw_proficiencies:['constitution'],gained_feats:['War Caster'],nat_1_20_saves:false} as unknown as Character;
const request=()=>createStandaloneDamage(character,u,9,2);
function receipt(r:StandaloneDamageRequest){return {requestId:r.requestId,saveRequestId:r.saveRequestId,replayed:false,automation:'prompt',resolution:null,
 hp:{requestId:r.requestId,mode:'damage',amount:9,beforeHP:20,beforeTempHP:6,afterHP:17,afterTempHP:0},
 check:{request_id:r.saveRequestId,character_id:c,spell_name:'Fly',casting_revision:4,damage:9,dc:10,save_bonus:5,has_advantage:true,natural_extremes:false,created_at:'2026-10-08T00:00:00Z',outcome:null,automation_mode:'prompt'},
 character:{...character,current_hp:17,temp_hp:0,hit_point_revision:3}};}
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();});afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('persists both identities before network I/O and verifies temp-first damage',async()=>{
 const r=request();expect(savedStandaloneDamage(u,c)).toEqual(r);expect(savedStandaloneDamage(other,c)).toBeNull();
 m.rpc.mockImplementation(async(name,args)=>{expect(name).toBe('apply_standalone_damage');expect(args.p_save_request_id).toBe(r.saveRequestId);expect(savedStandaloneDamage(u,c)).toEqual(r);return {data:receipt(r),error:null};});
 expect((await submitStandaloneDamage(r)).hp.afterHP).toBe(17);expect(savedStandaloneDamage(u,c)).toBeNull();
});
it('replays identical damage after a lost reply without a new identity',async()=>{
 const r=request();m.rpc.mockRejectedValue(new Error('Offline'));await expect(submitStandaloneDamage(r)).rejects.toThrow('Offline');
 expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);expect(savedStandaloneDamage(u,c)).toEqual(r);
 m.rpc.mockResolvedValue({data:{...receipt(r),replayed:true,character:{...character,current_hp:10,hit_point_revision:5}},error:null});
 expect((await submitStandaloneDamage(r)).character.current_hp).toBe(10);expect(savedStandaloneDamage(u,c)).toBeNull();
});
it('coalesces concurrent clicks and rejects replacing an unconfirmed request',async()=>{
 const r=request();let finish!:(v:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=submitStandaloneDamage(r);expect(submitStandaloneDamage(r)).toBe(first);expect(()=>request()).toThrow('previous damage');
 finish({data:receipt(r),error:null});await first;expect(m.rpc).toHaveBeenCalledOnce();
});
it.each(['amount','save','advantage','automation','missing','identity'])('keeps recovery when the %s receipt is wrong',async kind=>{
 const r=request(),v=receipt(r);
 if(kind==='amount')v.hp.afterHP=11;if(kind==='save')v.check.save_bonus=2;if(kind==='advantage')v.check.has_advantage=false;
 if(kind==='automation')v.check.automation_mode='auto';if(kind==='missing')Object.assign(v,{check:null});if(kind==='identity')v.character.id=other;
 m.rpc.mockResolvedValue({data:v,error:null});await expect(submitStandaloneDamage(r)).rejects.toThrow();expect(savedStandaloneDamage(u,c)).toEqual(r);
});
it('requires verified cancellation and retains already-applied damage',async()=>{
 const r=request();m.rpc.mockResolvedValue({data:{requestId:r.requestId,characterId:c,canceled:false,replayed:true},error:null});
 expect(await cancelStandaloneDamage(r)).toBe(false);expect(savedStandaloneDamage(u,c)).toEqual(r);
 m.rpc.mockResolvedValue({data:{requestId:r.requestId,characterId:c,canceled:true,replayed:false},error:null});expect(await cancelStandaloneDamage(r)).toBe(true);expect(savedStandaloneDamage(u,c)).toBeNull();
});
it('refuses malformed local storage rather than silently starting again',()=>{
 localStorage.setItem(`dndkeep:solo-damage:${u}:${c}`,'bad');expect(()=>savedStandaloneDamage(u,c)).toThrow('unreadable');expect(()=>request()).toThrow();expect(m.rpc).not.toHaveBeenCalled();
});
it('storage failure prevents sending damage',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});expect(()=>request()).toThrow('Storage full');expect(m.rpc).not.toHaveBeenCalled();
});
it('times out without letting a late response erase recovery',async()=>{
 vi.useFakeTimers();const r=request();let finish!:(v:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=submitStandaloneDamage(r),rejection=expect(first).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(15000);await rejection;
 finish({data:receipt(r),error:null});await Promise.resolve();expect(savedStandaloneDamage(u,c)).toEqual(r);
 m.rpc.mockResolvedValue({data:{...receipt(r),replayed:true},error:null});await submitStandaloneDamage(r);expect(savedStandaloneDamage(u,c)).toBeNull();
});

it('damage acknowledgement includes the captured exhaustion penalty',async()=>{
 const r=createStandaloneDamage({...character,exhaustion_level:2},u,9,2),v=receipt(r);
 v.check.save_bonus=1;m.rpc.mockResolvedValue({data:v,error:null});
 expect((await submitStandaloneDamage(r)).check?.save_bonus).toBe(1);
});

it('persists Bless and Bane dice before damage and never rerolls on retry',async()=>{
 const random=vi.spyOn(Math,'random').mockReturnValueOnce(0).mockReturnValueOnce(.75);
 const r=createStandaloneDamage({...character,active_buffs:[{name:'Bless',saveBonus:0},{name:'Bane'}]},u,9,2);
 expect(r.modifier).toBe(-1);expect(r.baseModifier).toBe(2);expect(r.effectRolls?.map(x=>x.total)).toEqual([1,-4]);
 m.rpc.mockRejectedValue(new Error('offline'));await expect(submitStandaloneDamage(r)).rejects.toThrow('offline');
 expect(savedStandaloneDamage(u,c)).toEqual(r);expect(()=>createStandaloneDamage(character,u,9,2)).toThrow('previous');expect(random).toHaveBeenCalledTimes(2);
 const v=receipt(r);v.check.save_bonus=2;m.rpc.mockResolvedValue({data:v,error:null});await submitStandaloneDamage(r);expect(random).toHaveBeenCalledTimes(2);
});
it('malformed saved effect arithmetic is not silently accepted',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);const r=createStandaloneDamage({...character,active_buffs:[{name:'Bless'}]},u,9,2);
 r.effectRolls![0].total=4;localStorage.setItem(`dndkeep:solo-damage:${u}:${c}`,JSON.stringify(r));expect(()=>savedStandaloneDamage(u,c)).toThrow('does not match');
});
it('damage without concentration does not roll temporary save effects',()=>{
 const random=vi.spyOn(Math,'random');const r=createStandaloneDamage({...character,concentration_spell:'',active_buffs:[{name:'Bane'}]},u,9,2);
 expect(r.effectRolls).toEqual([]);expect(random).not.toHaveBeenCalled();
});

it('accepts damage-time class advantage from the saved server offer',async()=>{
 const r=createStandaloneDamage({...character,gained_feats:[]},u,9,2);m.rpc.mockResolvedValue({data:receipt(r),error:null});
 await expect(submitStandaloneDamage(r)).resolves.toMatchObject({check:{has_advantage:true}});
});
it('does not drop known feat advantage from the saved damage check',async()=>{
 const r=request(),v=receipt(r);v.check.has_advantage=false;m.rpc.mockResolvedValue({data:v,error:null});
 await expect(submitStandaloneDamage(r)).rejects.toThrow('advantage');
});

it('rejects a non-boolean server advantage value and preserves recovery',async()=>{
 const r=createStandaloneDamage({...character,gained_feats:[]},u,9,2),v=receipt(r);
 m.rpc.mockResolvedValue({data:{...v,check:{...v.check,has_advantage:'true'}},error:null});
 await expect(submitStandaloneDamage(r)).rejects.toThrow('advantage');expect(savedStandaloneDamage(u,c)).toEqual(r);
});
