import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('./psionicTurns',()=>({psionicRpc:rpc}));
import {recoverTurnMovementFeatures} from './turnMovementRecovery';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={participantId:id(1),encounterId:id(2),turnId:id(3)};
const receipt={...input,characterId:id(4),recovered:['Feline Agility'],replayed:false};
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue(receipt);});
it('uses a turn-keyed idempotent request without a stale character snapshot',async()=>{
 expect(await recoverTurnMovementFeatures(input)).toEqual(receipt);expect(rpc).toHaveBeenCalledWith('recover_turn_movement_features',{p_participant:id(1),p_turn:id(3)},true);
});
it('accepts historical receipts without rewriting current resources',async()=>{
 rpc.mockResolvedValue({...receipt,replayed:true});expect((await recoverTurnMovementFeatures(input)).replayed).toBe(true);
});
it('rejects invalid identities before sending',async()=>{
 await expect(recoverTurnMovementFeatures({...input,turnId:'bad'})).rejects.toThrow('could not be confirmed');expect(rpc).not.toHaveBeenCalled();
});
it.each([{...receipt,encounterId:id(9)},{...receipt,recovered:['Psionic Restoration']},{...receipt,recovered:['Feline Agility','Feline Agility']},null])('rejects mismatched or malformed receipts %#',async value=>{
 rpc.mockResolvedValue(value);await expect(recoverTurnMovementFeatures(input)).rejects.toThrow('could not be confirmed');
});
it('propagates uncertain failures so the turn cannot silently continue',async()=>{
 rpc.mockRejectedValue(new Error('Offline'));await expect(recoverTurnMovementFeatures(input)).rejects.toThrow('Offline');
});
