// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PendingSpellCast} from '../../types';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
import {declarePaidSpell,readDeclaredSpell,settlePaidSpell} from '../api/declaredSpells';
import {offerCounterspell} from '../pendingReaction';
import {useSpellDeclaration} from './useSpellDeclaration';
vi.mock('../api/declaredSpells',()=>({declarePaidSpell:vi.fn(),readDeclaredSpell:vi.fn(),settlePaidSpell:vi.fn()}));
vi.mock('../pendingReaction',()=>({offerCounterspell:vi.fn()}));
const request={castId:'cast',characterId:'hero',userId:'owner',participantId:'caster',campaignId:'campaign',spellId:'fly',spellName:'Fly',slotLevel:3,expectedSlot:{total:2,used:0},context:{spellLevel:3,source:'class:Psion',ability:'intelligence',target:'',isBonusAction:false,range:'Touch',duration:'10 minutes'}} as SpellDeclarationRequest;
const cast={id:'cast',campaign_id:'campaign',encounter_id:'encounter',caster_participant_id:'caster',caster_character_id:'hero',caster_name:'Hero',spell_name:'Fly',spell_level:3,state:'declared',expires_at:'2099-01-01T00:00:00Z'} as PendingSpellCast;
const receipt={castId:'cast',outcome:'went_off',slotReturned:false,replayed:false} as const;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(declarePaidSpell).mockResolvedValue(cast);vi.mocked(readDeclaredSpell).mockResolvedValue({cast,readyToSettle:false});vi.mocked(offerCounterspell).mockResolvedValue(1);vi.mocked(settlePaidSpell).mockResolvedValue(receipt);});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('confirms the captured payment before offering and does not release effects from a pending cast',async()=>{
 const declared=vi.fn(),view=renderHook(()=>useSpellDeclaration(request,declared));expect(view.result.current.loading).toBe(true);
 await waitFor(()=>expect(view.result.current.loading).toBe(false));
 expect(declarePaidSpell).toHaveBeenCalledWith(request);expect(declared).toHaveBeenCalledTimes(1);expect(offerCounterspell).toHaveBeenCalledWith(expect.objectContaining({pendingSpellCastId:'cast',encounterId:'encounter'}));
 expect(view.result.current.offers).toBe(1);expect(view.result.current.receipt).toBeNull();expect(settlePaidSpell).not.toHaveBeenCalled();
});
it('retains a rejected declaration for explicit retry with exactly the same request',async()=>{
 vi.mocked(declarePaidSpell).mockRejectedValueOnce(new Error('stale slot'));const view=renderHook(()=>useSpellDeclaration(request,vi.fn()));
 await waitFor(()=>expect(view.result.current.error).toBe('stale slot'));expect(offerCounterspell).not.toHaveBeenCalled();act(()=>view.result.current.retry());
 await waitFor(()=>expect(view.result.current.loading).toBe(false));expect(vi.mocked(declarePaidSpell).mock.calls.map(call=>call[0])).toEqual([request,request]);
});
it('a failed prompt request retries the same paid identity without announcing another action',async()=>{
 vi.mocked(offerCounterspell).mockRejectedValueOnce(new Error('offline'));const declared=vi.fn(),view=renderHook(()=>useSpellDeclaration(request,declared));
 await waitFor(()=>expect(view.result.current.error).toBe('offline'));act(()=>view.result.current.retry());await waitFor(()=>expect(view.result.current.offers).toBe(1));expect(declared).toHaveBeenCalledTimes(1);
});
it('a terminal row cannot release effects until settlement is confirmed',async()=>{
 const resolved={...cast,state:'resolved'} as PendingSpellCast;vi.mocked(declarePaidSpell).mockResolvedValue(resolved);vi.mocked(readDeclaredSpell).mockResolvedValue({cast:resolved,readyToSettle:true});
 let finish!:(value:typeof receipt)=>void;vi.mocked(settlePaidSpell).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const view=renderHook(()=>useSpellDeclaration(request,vi.fn()));await waitFor(()=>expect(settlePaidSpell).toHaveBeenCalled());expect(view.result.current.receipt).toBeNull();
 await act(async()=>finish(receipt));expect(view.result.current.receipt).toEqual(receipt);expect(offerCounterspell).not.toHaveBeenCalled();
});
it('recovers a failed-save refund and never creates new offers for a contested cast',async()=>{
 const contested={...cast,state:'counterspell_offered'} as PendingSpellCast;vi.mocked(declarePaidSpell).mockResolvedValue(contested);vi.mocked(readDeclaredSpell).mockResolvedValue({cast:contested,readyToSettle:true});
 vi.mocked(settlePaidSpell).mockResolvedValue({castId:'cast',outcome:'countered',slotReturned:true,replayed:true});
 const view=renderHook(()=>useSpellDeclaration(request,vi.fn()));await waitFor(()=>expect(view.result.current.receipt?.outcome).toBe('countered'));expect(view.result.current.receipt?.slotReturned).toBe(true);expect(offerCounterspell).not.toHaveBeenCalled();
});
it('refuses an unverified legacy settlement instead of inventing success',async()=>{
 vi.mocked(readDeclaredSpell).mockResolvedValue({cast,readyToSettle:true});vi.mocked(settlePaidSpell).mockResolvedValue({legacy:true,castId:'cast'});
 const view=renderHook(()=>useSpellDeclaration(request,vi.fn()));await waitFor(()=>expect(view.result.current.error).toContain('no verified payment'));expect(view.result.current.receipt).toBeNull();
});
it('does not create offers for an already expired window',async()=>{
 vi.mocked(readDeclaredSpell).mockResolvedValue({cast,readyToSettle:true});const view=renderHook(()=>useSpellDeclaration(request,vi.fn()));
 await waitFor(()=>expect(view.result.current.receipt).toEqual(receipt));expect(offerCounterspell).not.toHaveBeenCalled();
});
it('ignores an obsolete declaration result after switching requests',async()=>{
 let finish!:(row:PendingSpellCast)=>void;vi.mocked(declarePaidSpell).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const view=renderHook(({value})=>useSpellDeclaration(value,vi.fn()),{initialProps:{value:request}});
 await act(async()=>{});
 const second={...request,castId:'second'},next={...cast,id:'second'};vi.mocked(declarePaidSpell).mockResolvedValue(next);vi.mocked(readDeclaredSpell).mockResolvedValue({cast:next,readyToSettle:false});
 view.rerender({value:second});expect(view.result.current.cast).toBeNull();await waitFor(()=>expect(view.result.current.cast?.id).toBe('second'));await act(async()=>finish(cast));expect(view.result.current.cast?.id).toBe('second');
 expect(offerCounterspell).toHaveBeenCalledTimes(1);
});
it('polling does not overlap an in-flight status read',async()=>{
 vi.useFakeTimers();let finish!:(value:{cast:PendingSpellCast;readyToSettle:boolean})=>void;vi.mocked(readDeclaredSpell).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 renderHook(()=>useSpellDeclaration(request,vi.fn()));await act(async()=>{});expect(readDeclaredSpell).toHaveBeenCalledTimes(1);
 await act(async()=>{vi.advanceTimersByTime(5000);});expect(readDeclaredSpell).toHaveBeenCalledTimes(1);
 await act(async()=>finish({cast,readyToSettle:false}));
});

it('times out a hung confirmation and ignores its eventual result until retry',async()=>{
 vi.useFakeTimers();let finish!:(row:PendingSpellCast)=>void;vi.mocked(declarePaidSpell).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const declared=vi.fn();
 const view=renderHook(()=>useSpellDeclaration(request,declared));await act(async()=>{vi.advanceTimersByTime(15_000);});
 expect(view.result.current.error).toContain('taking too long');await act(async()=>finish(cast));expect(view.result.current.cast).toBeNull();expect(declared).not.toHaveBeenCalled();
 act(()=>view.result.current.retry());await act(async()=>{});expect(view.result.current.cast?.id).toBe('cast');expect(declared).toHaveBeenCalledTimes(1);
});

it('does not send a payment before pending character saves finish',async()=>{
 let flush!:()=>void;const prepare=vi.fn(()=>new Promise<void>(resolve=>{flush=resolve;}));const view=renderHook(()=>useSpellDeclaration(request,vi.fn(),prepare));
 expect(declarePaidSpell).not.toHaveBeenCalled();await act(async()=>flush());await waitFor(()=>expect(view.result.current.loading).toBe(false));expect(declarePaidSpell).toHaveBeenCalledTimes(1);
});
it('retains failed character saves instead of sending a payment',async()=>{
 const view=renderHook(()=>useSpellDeclaration(request,vi.fn(),async()=>{throw new Error('Save failed');}));
 await waitFor(()=>expect(view.result.current.error).toBe('Save failed'));expect(declarePaidSpell).not.toHaveBeenCalled();
});
it('does not start payment if the dialog unmounts while saves are flushing',async()=>{
 let flush!:()=>void;const view=renderHook(()=>useSpellDeclaration(request,vi.fn(),()=>new Promise<void>(resolve=>{flush=resolve;})));
 view.unmount();await act(async()=>flush());expect(declarePaidSpell).not.toHaveBeenCalled();
});

it('retains the paid action context when later public status reads omit it',async()=>{
 const actionContext={encounterId:'encounter',turnId:'original',currentTurnId:'original',kind:'reaction'} as const;
 vi.mocked(declarePaidSpell).mockResolvedValue({...cast,actionContext});
 const view=renderHook(()=>useSpellDeclaration(request,undefined));await waitFor(()=>expect(view.result.current.loading).toBe(false));
 expect(view.result.current.actionContext).toEqual(actionContext);
});
