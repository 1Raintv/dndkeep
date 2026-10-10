import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
import {commitMovementAction} from './movementActions';
const id=(n:number)=>`${n}0000000-0000-4000-8000-000000000000`;
const receipt={encounterId:id(1),participantId:id(2),turnId:id(3),kind:'dash',requestId:id(4),replayed:false};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue(receipt);});
it('uses the rendered turn and idempotent RPC',async()=>{
 expect(await commitMovementAction(id(1),id(2),id(3),'dash')).toEqual(receipt);
 expect(m.rpc).toHaveBeenCalledWith('take_movement_action',{p_encounter:id(1),p_participant:id(2),p_turn:id(3),p_kind:'dash'},true);
});
it.each([{turnId:id(4)},{participantId:id(4)},{encounterId:id(4)},{kind:'disengage'},{requestId:'bad'},{replayed:null}])('rejects mismatched receipts %j',async change=>{
 m.rpc.mockResolvedValue({...receipt,...change});await expect(commitMovementAction(id(1),id(2),id(3),'dash')).rejects.toThrow('could not be confirmed');
});
it('rejects a missing rendered turn before sending',async()=>{
 await expect(commitMovementAction(id(1),id(2),'','dash')).rejects.toThrow('could not be verified');expect(m.rpc).not.toHaveBeenCalled();
});
it('accepts historical replay without making a separate flag or log write',async()=>{
 m.rpc.mockResolvedValue({...receipt,replayed:true});expect((await commitMovementAction(id(1),id(2),id(3),'dash')).replayed).toBe(true);expect(m.rpc).toHaveBeenCalledOnce();
});
