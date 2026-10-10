// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const m=vi.hoisted(()=>({equipment:vi.fn(),load:vi.fn(),roll:vi.fn(),confirm:vi.fn(),retire:vi.fn(),savedRolls:vi.fn(),savedDamage:vi.fn(),create:vi.fn(),submit:vi.fn(),cancel:vi.fn()}));
vi.mock('../gameUtils',()=>({computeStats:()=>({modifiers:{constitution:2}}),computeActiveBonuses:m.equipment}));
vi.mock('../api/standaloneDamage',()=>({STANDALONE_DAMAGE_CHANGED:'damage-changed',savedStandaloneDamage:m.savedDamage,createStandaloneDamage:m.create,submitStandaloneDamage:m.submit,cancelStandaloneDamage:m.cancel}));
vi.mock('../api/standaloneConcentration',()=>({STANDALONE_SAVE_CHANGED:'save-changed',loadStandaloneSaves:m.load,rollStandaloneSave:m.roll,confirmStandaloneRoll:m.confirm,retireStandaloneSave:m.retire,savedStandaloneRolls:m.savedRolls,savedStandaloneCreations:()=>[],queueStandaloneSave:vi.fn(),cancelStandaloneCreation:vi.fn()}));
import {useStandaloneConcentration} from './useStandaloneConcentration';
const character={id:'hero',user_id:'owner',concentration_spell:'Fly',concentration_revision:2} as Character;
const offer={request_id:'save',character_id:'hero',spell_name:'Fly',casting_revision:2,damage:5,dc:10,save_bonus:2,has_advantage:false,natural_extremes:false,created_at:'2026-10-08T00:00:00Z',outcome:null,automation_mode:'prompt' as const};
const receipt={requestId:'save',characterId:'hero',spell:'Fly',castingRevision:2,outcome:'passed',reason:'save',rolls:[15],d20:15,total:17,dc:10,bonus:2,advantage:false,replayed:false,character};
const queue=()=>({flush:vi.fn(async()=>{}),getSnapshot:()=>({pending:false,error:null})});
beforeEach(()=>{vi.resetAllMocks();m.equipment.mockReturnValue({saveBonus:0});m.savedDamage.mockReturnValue(null);m.savedRolls.mockReturnValue([]);m.load.mockResolvedValue({character,pending:[]});m.roll.mockResolvedValue(receipt);m.submit.mockResolvedValue({character,resolution:null});});afterEach(cleanup);
it('flushes edits before damage and blocks double clicks synchronously',async()=>{
 const q=queue(),accept=vi.fn(),ref={current:character};let finish!:()=>void;q.flush.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 m.create.mockReturnValue({requestId:'hit'});const {result}=renderHook(()=>useStandaloneConcentration('owner',ref,q,false,accept,vi.fn()));
 await waitFor(()=>expect(result.current.loading).toBe(false));accept.mockClear();
 act(()=>{expect(result.current.applyDamage(5)).toBe(true);expect(result.current.applyDamage(5)).toBe(false);});
 expect(m.create).toHaveBeenCalledOnce();expect(m.submit).not.toHaveBeenCalled();
 await act(async()=>{finish();});expect(m.submit).toHaveBeenCalledWith({requestId:'hit'});expect(result.current.busy).toBe(false);
});
it('failed queued edits leave damage recoverable without sending it',async()=>{
 const q=queue();q.getSnapshot=()=>({pending:false,error:'save failed'} as never);m.create.mockReturnValue({requestId:'hit'});
 const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:character},q,false,vi.fn(),vi.fn()));
 await act(async()=>{result.current.applyDamage(5);});expect(m.submit).not.toHaveBeenCalled();expect(result.current.error).toContain('failed character save');expect(result.current.loading).toBe(false);
});
it('ignores a late damage reply after switching characters',async()=>{
 let finish!:(value:unknown)=>void;m.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));m.create.mockReturnValue({requestId:'hit'});
 const ref={current:character},accept=vi.fn();const {result,rerender}=renderHook(()=>useStandaloneConcentration('owner',ref,queue(),false,accept,vi.fn()));
 await act(async()=>{result.current.applyDamage(5);});ref.current={...character,id:'other'};m.load.mockResolvedValue({character:ref.current,pending:[]});rerender();
 await waitFor(()=>expect(result.current.loading).toBe(false));accept.mockClear();await act(async()=>{finish({character,resolution:null});});expect(accept).not.toHaveBeenCalled();expect(result.current.busy).toBe(false);
});
it('automatic offers are attempted once even if a read still contains the settled row',async()=>{
 m.load.mockResolvedValue({character,pending:[{...offer,automation_mode:'auto'}]});
 const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:character},queue(),false,vi.fn(),vi.fn()));
 await waitFor(()=>expect(m.roll).toHaveBeenCalledOnce());await waitFor(()=>expect(result.current.busy).toBe(false));
 await act(async()=>{result.current.reload();});expect(m.roll).toHaveBeenCalledOnce();
});
it('uses saved dice instead of rolling again and skips replay animations',async()=>{
 const saved={userId:'owner',characterId:'hero',requestId:'save',offer,rolls:[15]};m.savedRolls.mockReturnValue([saved]);m.confirm.mockResolvedValue({...receipt,replayed:true});const animate=vi.fn();
 const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:character},queue(),false,vi.fn(),animate));
 await act(async()=>{await result.current.roll(offer);});expect(m.confirm).toHaveBeenCalledWith(saved);expect(m.roll).not.toHaveBeenCalled();expect(animate).not.toHaveBeenCalled();
});
it('retires an obsolete check without generating a die',async()=>{
 m.retire.mockResolvedValue({...receipt,outcome:'obsolete',reason:'casting_changed',d20:null,total:null,rolls:null});
 const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:{...character,concentration_revision:3}},queue(),false,vi.fn(),vi.fn()));
 await act(async()=>{await result.current.roll(offer);});expect(m.retire).toHaveBeenCalledWith(offer);expect(m.roll).not.toHaveBeenCalled();
});
it('surfaces malformed recovery during retry without an unhandled rejection',async()=>{
 m.savedDamage.mockImplementation(()=>{throw new Error('Unreadable damage');});
 const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:character},queue(),false,vi.fn(),vi.fn()));
 await act(async()=>{await result.current.retryDamage();});expect(result.current.blockedHP).toBe(true);expect(result.current.error).toContain('Unreadable');expect(m.submit).not.toHaveBeenCalled();
});
it('frozen and nonowner sheets cannot start or roll saved damage',async()=>{
 const {result,rerender}=renderHook(({user,frozen})=>useStandaloneConcentration(user,{current:character},queue(),frozen,vi.fn(),vi.fn()),{initialProps:{user:'owner',frozen:true}});
 expect(result.current.applyDamage(5)).toBe(false);await act(async()=>{await result.current.roll(offer);});rerender({user:'other',frozen:false});expect(result.current.applyDamage(5)).toBe(false);expect(m.create).not.toHaveBeenCalled();expect(m.roll).not.toHaveBeenCalled();
});

it('includes eligible equipment without adding proficiency or combat buffs twice',async()=>{
 m.equipment.mockReturnValue({saveBonus:2});m.create.mockReturnValue({requestId:'hit'});
 const c={...character,inventory:[]};const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:c},queue(),false,vi.fn(),vi.fn()));
 await act(async()=>{result.current.applyDamage(5);});
 expect(m.equipment).toHaveBeenCalledWith([],c.inventory);expect(m.create).toHaveBeenCalledWith(c,'owner',5,4);
});
it.each(['1',NaN,Infinity,0.5])('rejects malformed equipment save bonus %s before saving damage',async saveBonus=>{
 m.equipment.mockReturnValue({saveBonus});const {result}=renderHook(()=>useStandaloneConcentration('owner',{current:character},queue(),false,vi.fn(),vi.fn()));
 await act(async()=>{expect(result.current.applyDamage(5)).toBe(false);});
 expect(result.current.error).toContain('equipment saving throw');expect(m.create).not.toHaveBeenCalled();expect(m.submit).not.toHaveBeenCalled();
});
