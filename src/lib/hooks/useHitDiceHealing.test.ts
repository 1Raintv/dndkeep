// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
import type {PsionicEnhancementPersistence} from '../api/psionicTurns';
import {createHitDiceHealingRequest,type HitDiceHealingRequest} from '../hitDiceHealingRequest';
import {rememberPsionicPayment} from '../psionicPaymentRecovery';
const mocks=vi.hoisted(()=>({roll:vi.fn(()=>1)}));
vi.mock('../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../gameUtils',()=>({computeStats:()=>({modifiers:{constitution:-3}})}));
vi.mock('../supabase',()=>({supabase:{rpc:vi.fn()}}));
import {useHitDiceHealing} from './useHitDiceHealing';
const base={id:'hero',class_name:'Psion',level:5,hit_dice_spent:0,hit_dice_spent_by_type:{},current_hp:1,max_hp:20,temp_hp:0,hit_point_revision:0,psionic_hit_dice_revision:0,constitution:4,inventory:[]} as unknown as Character;
function fixture(){
 const characterRef={current:structuredClone(base)};
 const queue={flush:vi.fn(async()=>{}),getSnapshot:vi.fn(()=>({pending:false,error:null as string|null})),getAcknowledged:vi.fn(()=>null as Partial<Character>|null)};
 const heal=vi.fn(async(_request:HitDiceHealingRequest)=>({gained:1,healing:1}));
 const options={characterRef,queue,persistence:{heal} as unknown as PsionicEnhancementPersistence,acceptSaved:vi.fn((saved:Partial<Character>)=>{characterRef.current={...characterRef.current,...saved};}),animate:vi.fn(),onGained:vi.fn(),disabled:false};
 return {options,heal,queue,characterRef};
}
afterEach(cleanup);beforeEach(()=>{localStorage.clear();mocks.roll.mockReset().mockReturnValue(1);});
it('waits for queued edits, captures their acknowledged revision, and animates without another history write',async()=>{
 const f=fixture();let finish!:()=>void;f.queue.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 f.queue.getAcknowledged.mockReturnValue({...base,current_hp:3,hit_point_revision:2});
 const hook=renderHook(()=>useHitDiceHealing(f.options));let pending!:Promise<void>;
 act(()=>{pending=hook.result.current.roll(1,6);});expect(mocks.roll).not.toHaveBeenCalled();expect(hook.result.current.isBlocked()).toBe(true);
 await act(async()=>{finish();await pending;});expect(f.heal.mock.calls[0][0]).toMatchObject({rolls:[1],constitutionModifier:-3,expected:{current_hp:3,hit_point_revision:2}});
 expect(f.options.onGained).toHaveBeenCalledWith(1);expect(f.options.animate.mock.calls[0][0]).not.toHaveProperty('logHistory');expect(hook.result.current.blocked).toBe(false);
});
it('prevents double clicks from producing two sets of rolls',async()=>{
 const f=fixture();let finish!:()=>void;f.queue.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const hook=renderHook(()=>useHitDiceHealing(f.options));let pending!:Promise<void>;
 act(()=>{pending=hook.result.current.roll(1,6);});await act(async()=>{await hook.result.current.roll(1,6);finish();await pending;});expect(f.heal).toHaveBeenCalledTimes(1);expect(mocks.roll).toHaveBeenCalledTimes(1);
});
it.each(['failed','pending','disabled','zero','full','exhausted'])('does not roll or pay for %s input',async mode=>{
 const f=fixture();if(mode==='failed')f.queue.getSnapshot.mockReturnValue({pending:true,error:'Offline'});if(mode==='pending')f.queue.getSnapshot.mockReturnValue({pending:true,error:null});if(mode==='disabled')f.options.disabled=true;
 if(mode==='zero')f.characterRef.current.current_hp=0;if(mode==='full')f.characterRef.current.current_hp=20;if(mode==='exhausted'){f.characterRef.current.hit_dice_spent=5;f.characterRef.current.hit_dice_spent_by_type={'6':5};}
 const hook=renderHook(()=>useHitDiceHealing(f.options));await act(async()=>{await hook.result.current.roll(1,6);});expect(f.heal).not.toHaveBeenCalled();expect(mocks.roll).not.toHaveBeenCalled();
});
it('confirms the exact saved request without rerolling or repeating the gained counter',async()=>{
 const f=fixture(),request=createHitDiceHealingRequest(base,6,[1],-3,'11111111-1111-4111-8111-111111111111');rememberPsionicPayment('hero',{kind:'healing',request});
 const hook=renderHook(()=>useHitDiceHealing(f.options));await act(async()=>{await hook.result.current.roll(1,6);});expect(f.heal).not.toHaveBeenCalled();
 await act(async()=>{await hook.result.current.recover(request);});expect(f.heal).toHaveBeenCalledWith(request);expect(mocks.roll).not.toHaveBeenCalled();expect(f.options.onGained).not.toHaveBeenCalled();expect(f.options.animate).not.toHaveBeenCalled();expect(hook.result.current.message).toContain('Saved healing confirmed');
});
it('leaves an uncertain result blocked until explicitly confirmed or dismissed',async()=>{
 const f=fixture();f.heal.mockImplementation(async request=>{rememberPsionicPayment('hero',{kind:'healing',request});throw new Error('Lost response');});
 const hook=renderHook(()=>useHitDiceHealing(f.options));await act(async()=>{await hook.result.current.roll(1,6);});expect(hook.result.current.blocked).toBe(true);expect(hook.result.current.message).toBe('Lost response');
 await act(async()=>{await hook.result.current.roll(1,6);});expect(f.heal).toHaveBeenCalledTimes(1);const request=hook.result.current.pending[0].request;
 act(()=>hook.result.current.dismiss(request.requestId));expect(hook.result.current.blocked).toBe(false);expect(f.options.onGained).not.toHaveBeenCalled();
});
it.each(['switch','close'])('does not send after %s during the initial save flush',async mode=>{
 const f=fixture();let finish!:()=>void;f.queue.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const hook=renderHook(()=>useHitDiceHealing(f.options));let pending!:Promise<void>;
 act(()=>{pending=hook.result.current.roll(1,6);});if(mode==='switch'){f.characterRef.current={...base,id:'other'};hook.rerender();}else hook.unmount();await act(async()=>{finish();await pending;});expect(f.heal).not.toHaveBeenCalled();expect(mocks.roll).not.toHaveBeenCalled();
});
