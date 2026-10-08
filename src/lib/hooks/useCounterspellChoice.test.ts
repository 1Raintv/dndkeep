// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Character,PendingReaction} from '../../types';
import {useCounterspellChoice} from './useCounterspellChoice';
import {loadReactionCharacter} from '../api/reactionCharacter';
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('../api/reactionCharacter',()=>({loadReactionCharacter:vi.fn()}));
const hero={class_name:'Psion',level:5,intelligence:18,wisdom:10,charisma:10,spell_sources:{counterspell:['class:Psion']},spell_preparation_sources:{counterspell:['class:Psion']},prepared_spells:['counterspell'],spell_slots:{3:{total:2,used:0}}} as unknown as Character;
const offer={id:'one',reaction_key:'counterspell',reactor_participant_id:'reactor'} as PendingReaction;
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
it('does not load other reaction types or closed offers',()=>{
 const view=renderHook(({value})=>useCounterspellChoice(value),{initialProps:{value:null as PendingReaction|null}});
 view.rerender({value:{...offer,reaction_key:'shield'}});expect(loadReactionCharacter).not.toHaveBeenCalled();
});
it('blocks initial loading and failed reads until a successful retry',async()=>{
 vi.mocked(loadReactionCharacter).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(hero);
 const view=renderHook(()=>useCounterspellChoice(offer));
 expect(view.result.current.loading).toBe(true);expect(view.result.current.selected).toBeNull();
 await waitFor(()=>expect(view.result.current.error).toBe(true));
 act(()=>view.result.current.retry());
 await waitFor(()=>expect(view.result.current.selected?.saveDC).toBe(15));
 expect(view.result.current.error).toBe(false);
});
it('cannot reuse the previous reactor or accept an obsolete lookup',async()=>{
 let resolve!:(hero:Character)=>void;
 vi.mocked(loadReactionCharacter).mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValueOnce({...hero,intelligence:12});
 const view=renderHook(({value})=>useCounterspellChoice(value),{initialProps:{value:offer}});
 view.rerender({value:{...offer,id:'two',reactor_participant_id:'other'}});
 expect(view.result.current.selected).toBeNull();
 await waitFor(()=>expect(view.result.current.selected?.saveDC).toBe(12));
 await act(async()=>resolve(hero));
 expect(view.result.current.selected?.saveDC).toBe(12);
});

it('times out a hung read and ignores its eventual result',async()=>{
 vi.useFakeTimers();let resolve!:(hero:Character)=>void;
 vi.mocked(loadReactionCharacter).mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const view=renderHook(()=>useCounterspellChoice(offer));
 await act(async()=>{vi.advanceTimersByTime(15_000);});
 expect(view.result.current.error).toBe(true);expect(view.result.current.selected).toBeNull();
 await act(async()=>resolve(hero));expect(view.result.current.selected).toBeNull();
});
it('rechecks a reopened offer instead of enabling a stale resource snapshot',async()=>{
 vi.mocked(loadReactionCharacter).mockResolvedValueOnce(hero).mockReturnValueOnce(new Promise(()=>{}));
 const view=renderHook(({value})=>useCounterspellChoice(value),{initialProps:{value:offer as PendingReaction|null}});
 await waitFor(()=>expect(view.result.current.selected?.saveDC).toBe(15));
 view.rerender({value:null});view.rerender({value:offer});
 expect(view.result.current.loading).toBe(true);expect(view.result.current.selected).toBeNull();
});
