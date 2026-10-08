import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('./psionicTurns',async()=>{const actual=await vi.importActual<typeof import('./psionicTurns')>('./psionicTurns');return {...actual,psionicRpc:mocks.rpc};});
vi.mock('../supabase',()=>({supabase:{}}));
import {getPsionicEffectRollRecords,finalizePsionicEffectRoll,applyBiofeedbackEffect} from './psionicEffectRolls';
const id='00000000-0000-4000-8000-000000000001';
const record=()=>({requestId:id,characterId:'hero',discipline:'destructive-thoughts',context:{target:'Goblin'},modifier:4,sides:8,usedSurge:true,baseRolls:[1,2],enkindledRolls:[3,8],originalRolls:[1,2,3,8],rolls:[4,4,4,8],total:24,activatedAt:'2026-10-08T16:00:00Z',turn:{soloTurn:0},finalized:false,applied:false,expiredByLongRest:false});
beforeEach(()=>vi.resetAllMocks());
it('reads the authoritative linked base and enhancements',async()=>{mocks.rpc.mockResolvedValue([record()]);expect(await getPsionicEffectRollRecords('hero')).toEqual([record()]);expect(mocks.rpc).toHaveBeenCalledWith('get_psionic_effect_roll_records',{p_character_id:'hero'},true);});
it.each([{characterId:'other'},{total:28},{originalRolls:[1,2]},{rolls:[4,2,4,8],total:22},{baseRolls:[1,2,3,4,5]},{context:[]},{finalized:undefined}])('rejects inconsistent server records: %j',patch=>{mocks.rpc.mockResolvedValue([{...record(),...patch}]);return expect(getPsionicEffectRollRecords('hero')).rejects.toMatchObject({definitelyNotPaid:false});});
it('rejects duplicate IDs',async()=>{mocks.rpc.mockResolvedValue([record(),record()]);await expect(getPsionicEffectRollRecords('hero')).rejects.toThrow(/verified/);});
it('finalizes with stable identity and verifies its receipt',async()=>{mocks.rpc.mockResolvedValue({...record(),replayed:true});expect(await finalizePsionicEffectRoll('hero',id)).toMatchObject({total:24,replayed:true});expect(mocks.rpc).toHaveBeenCalledWith('finalize_psionic_effect_roll',{p_character_id:'hero',p_activation_id:id},true);});
it('does not accept another effect receipt or submit an invalid ID',async()=>{mocks.rpc.mockResolvedValue({...record(),requestId:'00000000-0000-4000-8000-000000000002',replayed:true});await expect(finalizePsionicEffectRoll('hero',id)).rejects.toMatchObject({definitelyNotPaid:false});mocks.rpc.mockClear();await expect(finalizePsionicEffectRoll('hero','bad')).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();});

it('accepts a replay with lower current HP without changing the historical grant',async()=>{
 const receipt={effect:'biofeedback',requestId:id,characterId:'hero',granted:12,beforeTempHP:0,afterTempHP:12,replayed:true,character:{id:'hero',current_hp:5,max_hp:10,temp_hp:1,hit_point_revision:4}};
 mocks.rpc.mockResolvedValue(receipt);expect(await applyBiofeedbackEffect('hero',id)).toEqual(receipt);expect(mocks.rpc).toHaveBeenCalledWith('apply_biofeedback_effect',{p_character_id:'hero',p_activation_id:id},true);
 mocks.rpc.mockResolvedValue({...receipt,afterTempHP:13});await expect(applyBiofeedbackEffect('hero',id)).rejects.toMatchObject({definitelyNotPaid:false});
});
