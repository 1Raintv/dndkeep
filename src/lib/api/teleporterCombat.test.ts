import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
import {getTeleporterFollowup} from './teleporterCombat';
const id='00000000-0000-4000-8000-000000000001',parent='00000000-0000-4000-8000-000000000002';
const value={parentId:parent,characterId:id,turnId:'turn',psionLevel:6,kind:'slot',status:'waiting',encounterId:id};
beforeEach(()=>vi.resetAllMocks());
it.each(['waiting','ready','interrupted'])('preserves %s instead of assuming a casting succeeded',async status=>{
 m.rpc.mockResolvedValue({...value,status});expect(await getTeleporterFollowup(id)).toEqual({...value,status});
 expect(m.rpc).toHaveBeenCalledWith('get_teleporter_combat_followup',{p_character:id},true);
});
it('distinguishes no follow-up from read failure and supports free solo origins',async()=>{
 m.rpc.mockResolvedValue(null);expect(await getTeleporterFollowup(id)).toBeNull();
 m.rpc.mockRejectedValue(new Error('offline'));await expect(getTeleporterFollowup(id)).rejects.toThrow('offline');
 m.rpc.mockResolvedValue({...value,kind:'free',status:'ready',encounterId:null});expect((await getTeleporterFollowup(id))?.kind).toBe('free');
});
it.each([{parentId:'bad'},{characterId:parent},{turnId:''},{psionLevel:5},{psionLevel:6.5},{kind:'unknown'},{status:'expired'},{encounterId:'bad'},{encounterId:null},{kind:'free',status:'waiting'}])('rejects a mismatched or invalid hint %j',async patch=>{
 m.rpc.mockResolvedValue({...value,...patch});await expect(getTeleporterFollowup(id)).rejects.toThrow('verified');
});
it('rejects malformed character identifiers before a request',async()=>{await expect(getTeleporterFollowup('bad')).rejects.toThrow('Invalid');expect(m.rpc).not.toHaveBeenCalled();});
