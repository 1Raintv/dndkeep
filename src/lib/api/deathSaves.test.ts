// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),die:vi.fn(),groups:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('../../rules/dice',()=>({rollDie:m.die,rollDiceGroups:m.groups}));
import {prepareDeathSave,confirmDeathSave,savedDeathSave,pendingDeathSaveDrafts,resolveAutomaticDeathSaveRoll,nextDeathSave} from './deathSaves';
const context={pendingId:'save',characterId:'hero',participantId:'part',combatantId:'cb',encounterId:'enc',state:'pending',encounterStatus:'active',hp:0,stable:false,dead:false,successes:0,failures:0,exhaustion:0,buffs:[],conditions:[]};
const receipt={pendingId:'save',outcome:'failure',d20:12,total:9,dice:[12],bonus:0,exhaustion:0,successes:0,failures:1,stable:false,dead:false,hp:0,replayed:false,penalty:{saveId:'save',saveKind:'death',penalty:3,die:3,consumedIds:['effect'],expiredIds:[]}};
const prepare=()=>prepareDeathSave('hero','save',0,false,false);
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.die.mockImplementation((s:number)=>s===20?12:3);m.rpc.mockImplementation(async(name:string)=>name==='get_death_save_context'?structuredClone(context):structuredClone(receipt));});
it('stores dice before any settlement request',async()=>{await prepare();expect(savedDeathSave('hero','save')).toMatchObject({dice:[12],penaltyD4:3});expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(['get_death_save_context']);});
it('reuses stored dice across failed confirmation and reload-style prepare',async()=>{await prepare();m.rpc.mockRejectedValueOnce(new Error('offline'));await expect(confirmDeathSave('hero','save')).rejects.toThrow('offline');await prepare();await confirmDeathSave('hero','save');expect(m.die).toHaveBeenCalledTimes(2);expect(savedDeathSave('hero','save')).toBeNull();});
it('keeps unacknowledged proposals discoverable',async()=>{await prepare();expect(pendingDeathSaveDrafts('hero').map(r=>r.pendingId)).toEqual(['save']);expect(pendingDeathSaveDrafts('other')).toEqual([]);});
it('explicit review preserves dice while refreshing settings',async()=>{await prepare();const fresh={...context,failures:1};m.rpc.mockResolvedValue(fresh);expect(await prepareDeathSave('hero','save',2,false,false,true)).toMatchObject({dice:[12],bonus:2,context:{failures:1}});expect(m.die).toHaveBeenCalledTimes(2);});
it('advantage review adds only a missing second die and retains it when toggled',async()=>{await prepare();await prepareDeathSave('hero','save',0,true,false,true);await prepareDeathSave('hero','save',0,false,false,true);expect(await prepareDeathSave('hero','save',0,true,false,true)).toMatchObject({dice:[12,12],pool:[12,12]});expect(m.die).toHaveBeenCalledTimes(3);});
it('refuses malformed storage instead of rerolling',async()=>{localStorage.setItem('dndkeep:death-save:hero:save','{}');await expect(prepare()).rejects.toThrow('verified');expect(m.die).not.toHaveBeenCalled();});
it('retains dice when receipt arithmetic is invalid',async()=>{await prepare();m.rpc.mockResolvedValue({...receipt,total:10});await expect(confirmDeathSave('hero','save')).rejects.toThrow('verified');expect(savedDeathSave('hero','save')).not.toBeNull();});
it('accepts obsolete receipts without invented dice',async()=>{await prepare();m.rpc.mockResolvedValue({pendingId:'save',outcome:'obsolete',d20:null,total:null,penalty:null,replayed:false});expect(await confirmDeathSave('hero','save')).toMatchObject({outcome:'obsolete'});expect(savedDeathSave('hero','save')).toBeNull();});
it('coalesces simultaneous confirmation clicks',async()=>{await prepare();const a=confirmDeathSave('hero','save'),b=confirmDeathSave('hero','save');expect(a).toBe(b);await a;expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_pending_death_save')).toHaveLength(1);});
it('storage failure prevents settlement',async()=>{const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});try{await expect(prepare()).rejects.toThrow('storage blocked');expect(m.rpc.mock.calls.some(c=>c[0]==='settle_pending_death_save')).toBe(false);}finally{spy.mockRestore();}});
it('does not accept another pending save receipt',async()=>{await prepare();m.rpc.mockResolvedValue({...receipt,pendingId:'other'});await expect(confirmDeathSave('hero','save')).rejects.toThrow();expect(savedDeathSave('hero','save')).not.toBeNull();});

it('automatic preparation retains buff dice and includes equipment-independent bonuses',async()=>{
 m.rpc.mockResolvedValue({...context,inventory:[],buffs:[{name:'Bless',saveBonus:'1d4'}]});m.groups.mockReturnValue({dice:[{die:4,value:3}],modifier:0,total:3});
 expect(await prepareDeathSave('hero','save',0,false,false,false,true)).toMatchObject({bonus:3,bonusRolls:[{name:'Bless',total:3,dice:[{die:4,value:3}]}]});
 await prepareDeathSave('hero','save',0,false,false,false,true);expect(m.groups).toHaveBeenCalledTimes(1);
});
it('automatic failure exposes the existing offer for review',async()=>{
 m.rpc.mockImplementation(async(name:string)=>{if(name==='get_death_save_context')return {...context,inventory:[],buffs:[{name:'Unknown',saveBonus:'special'}]};return null;});m.groups.mockReturnValue(null);
 await expect(resolveAutomaticDeathSaveRoll('hero','save')).rejects.toThrow('cannot be rolled');
 expect(m.rpc).toHaveBeenCalledWith('review_automatic_death_save',{p_pending:'save'},true);
 expect(m.rpc.mock.calls.some(c=>c[0]==='settle_pending_death_save')).toBe(false);
});

it('discovers abandoned automatic offers through the server clock',async()=>{
 m.rpc.mockResolvedValue('orphan');expect(await nextDeathSave('hero')).toBe('orphan');
 expect(m.rpc).toHaveBeenCalledWith('next_recoverable_death_save',{p_character:'hero'});
});
it('keeps local saved dice ahead of server discovery',async()=>{
 await prepare();m.rpc.mockClear();expect(await nextDeathSave('hero')).toBe('save');expect(m.rpc).not.toHaveBeenCalled();
});
it('manual recovery changes automatic mode before rolling and uses the fresh context',async()=>{
 m.rpc.mockResolvedValueOnce({...context,resolutionMode:'auto'}).mockResolvedValueOnce(null).mockResolvedValueOnce({...context,resolutionMode:'prompt'});
 expect(await prepare()).toMatchObject({context:{resolutionMode:'prompt'},dice:[12]});
 expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(['get_death_save_context','review_automatic_death_save','get_death_save_context']);
});
it('does not roll if the automatic save won the recovery race',async()=>{
 m.rpc.mockResolvedValueOnce({...context,resolutionMode:'auto'}).mockResolvedValueOnce(null).mockResolvedValueOnce({...context,resolutionMode:'auto',state:'rolled'});
 await expect(prepare()).rejects.toThrow('already resolved');expect(m.die).not.toHaveBeenCalled();
});
