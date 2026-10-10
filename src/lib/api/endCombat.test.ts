import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),rpc:vi.fn(),guard:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:m.read})})})}}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./liveTurnTransitions',()=>({withCurrentTurnUser:(fn:(user:string,guard:()=>void)=>Promise<unknown>)=>fn('dm',m.guard)}));
import {completeCombat} from './endCombat';
const enc='00000000-0000-0000-0000-000000000001',turn='00000000-0000-0000-0000-000000000002';
const receipt={encounterId:enc,turnId:turn,endedAt:'2026-10-10T00:00:00Z',characterCount:1,templateCount:0,replayed:false};
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue({data:{psionic_turn_id:turn},error:null});m.rpc.mockImplementation(async name=>name==='read_combat_completion'?null:receipt);});
it('uses the observed turn and an idempotent server request',async()=>{
 expect(await completeCombat(enc)).toEqual(receipt);expect(m.rpc).toHaveBeenCalledWith('end_combat_encounter',{p_encounter:enc,p_turn:turn},true);
});
it.each([{data:null,error:{message:'offline'}},{data:null,error:null},{data:{psionic_turn_id:'bad'},error:null}])('never ends an unverified turn',async response=>{
 m.read.mockResolvedValue(response);await expect(completeCombat(enc)).rejects.toThrow();expect(m.rpc.mock.calls.every(call=>call[0]==='read_combat_completion')).toBe(true);
});
it.each([{turnId:enc},{encounterId:turn},{endedAt:'bad'},{characterCount:-1},{templateCount:0.5},{replayed:null}])('rejects malformed receipts %j',async change=>{
 m.rpc.mockImplementation(async name=>name==='read_combat_completion'?null:{...receipt,...change});await expect(completeCombat(enc)).rejects.toThrow('could not be confirmed');
});
it('recovers a completed encounter before reading its rotated live turn',async()=>{
 m.rpc.mockRejectedValueOnce(new Error('offline'));
 await expect(completeCombat(enc)).rejects.toThrow('offline');expect(m.read).not.toHaveBeenCalled();
 m.rpc.mockResolvedValueOnce({...receipt,replayed:true});expect((await completeCombat(enc)).replayed).toBe(true);
 expect(m.read).not.toHaveBeenCalled();
});
it('does not submit after the signed-in user changes during the read',async()=>{
 m.guard.mockImplementation(()=>{throw new Error('Sign-in changed');});await expect(completeCombat(enc)).rejects.toThrow('Sign-in changed');expect(m.rpc.mock.calls.every(call=>call[0]==='read_combat_completion')).toBe(true);
});
