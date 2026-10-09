import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('./psionicTurns',()=>({psionicRpc:rpc}));
import {getPropelSaveContext} from './propelSaveContext';
const fixture=()=>({declarationId:'use',characterId:'hero',encounterId:'enc',participantId:'target',legendaryResistanceRemaining:0,state:{target:{id:'target',entityId:'creature',type:'creature',combatantId:'combatant'},conditions:[],buffs:[],exhaustion:0,naturalExtremes:false,autoFail:false,advantage:false,disadvantage:false}});
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue(fixture());});
it('requests the declaration-scoped server snapshot',async()=>{
 expect(await getPropelSaveContext('hero','use','enc','target')).toEqual(fixture());expect(rpc).toHaveBeenCalledWith('get_propel_save_context',{p_character:'hero',p_declaration:'use'});
});
it.each([{declarationId:'other'},{characterId:'other'},{encounterId:'other'},{participantId:'other'},{legendaryResistanceRemaining:-1},{state:null}])('rejects mismatched context %j',async patch=>{
 rpc.mockResolvedValue({...fixture(),...patch});await expect(getPropelSaveContext('hero','use','enc','target')).rejects.toThrow('could not be verified');
});
it.each([{conditions:null},{conditions:[1]},{buffs:{}},{exhaustion:7},{autoFail:null},{naturalExtremes:undefined},{target:{id:'other'}}])('rejects malformed target state %j',async patch=>{
 rpc.mockResolvedValue({...fixture(),state:{...fixture().state,...patch}});await expect(getPropelSaveContext('hero','use','enc','target')).rejects.toThrow('could not be verified');
});
it('preserves server failure without returning guessed flags',async()=>{
 rpc.mockRejectedValue(new Error('Declared target unavailable'));await expect(getPropelSaveContext('hero','use','enc','target')).rejects.toThrow('Declared target unavailable');
});
