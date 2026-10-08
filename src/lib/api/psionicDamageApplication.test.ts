import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),effective:vi.fn(),read:vi.fn(),resolve:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:mocks.rpc}));
vi.mock('../attunement',()=>({getEffectiveAbilityScores:mocks.effective}));
vi.mock('./concentrationSaves',()=>({readConcentrationResult:mocks.read,resolveConcentrationSave:mocks.resolve}));
import {applyDestructiveThoughtsDamage} from './psionicDamageApplication';
const dice={version:1,sides:8,originalRolls:[1,5,3],rolls:[1,5,3],modifier:4};
const attack={id:'hit',state:'damage_rolled',attack_kind:'auto_hit',attack_name:'Destructive Thoughts',psionic_damage_dice:dice} as unknown as PendingAttack;
const receipt=()=>({attack:{...attack,state:'applied',damage_final:13},replayed:false,settlement:{attackId:'hit',damage:13,characterId:'hero',concentrationCheckId:null,concentrationMode:'prompt'}});
beforeEach(()=>{vi.resetAllMocks();mocks.effective.mockImplementation(s=>s);});
it('a saved receipt is sufficient without re-reading mutable target state',async()=>{
 const saved=receipt();mocks.rpc.mockResolvedValue(saved);expect(await applyDestructiveThoughtsDamage(attack)).toEqual(saved.attack);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc).toHaveBeenCalledWith('apply_psionic_pending_damage',{p_attack_id:'hit'},true);
});
it('captures effective Constitution and sends the full verified context',async()=>{
 const ctx={attack,target:{definitionType:'character',definition:{strength:10,dexterity:10,constitution:12,intelligence:10,wisdom:10,charisma:10,inventory:[]}}};
 mocks.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce(ctx).mockResolvedValueOnce(receipt());mocks.effective.mockReturnValue({constitution:19});
 await applyDestructiveThoughtsDamage(attack);expect(mocks.rpc).toHaveBeenLastCalledWith('apply_psionic_pending_damage',{p_attack_id:'hit',p_expected:ctx,p_con_modifier:4},true);
});
it('reuses a saved automatic concentration result instead of rolling again',async()=>{
 const saved=receipt();saved.settlement={...saved.settlement,concentrationMode:'auto',concentrationCheckId:'check' as never};
 mocks.rpc.mockResolvedValue(saved);mocks.read.mockResolvedValue({passed:true});await applyDestructiveThoughtsDamage(attack);expect(mocks.resolve).not.toHaveBeenCalled();
});
it('resumes unresolved automatic concentration after a committed damage retry',async()=>{
 const saved=receipt();saved.settlement={...saved.settlement,concentrationMode:'auto',concentrationCheckId:'check' as never};
 mocks.rpc.mockResolvedValue(saved);mocks.read.mockResolvedValue(null);await applyDestructiveThoughtsDamage(attack);expect(mocks.resolve).toHaveBeenCalledTimes(1);expect(mocks.resolve).toHaveBeenCalledWith('hero','check','player');
});
it.each([null,{attack:{}},{...receipt(),settlement:{...receipt().settlement,damage:14}},{...receipt(),replayed:undefined}])('rejects incomplete or inconsistent application receipts: %j',async value=>{
 mocks.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({attack,target:null}).mockResolvedValueOnce(value);
 await expect(applyDestructiveThoughtsDamage(attack)).rejects.toThrow(/could not be confirmed/);
});
it('legacy applied attacks without a receipt are never applied again',async()=>{
 const legacy={...attack,state:'applied'} as PendingAttack;mocks.rpc.mockResolvedValue(null);expect(await applyDestructiveThoughtsDamage(legacy)).toEqual(legacy);expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('invalid character scores stop before submitting damage',async()=>{
 mocks.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({attack,target:{definitionType:'character',definition:{constitution:'12'}}});
 await expect(applyDestructiveThoughtsDamage(attack)).rejects.toThrow(/ability scores/);expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
