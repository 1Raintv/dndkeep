import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({update:vi.fn(),eq:vi.fn(),select:vi.fn(),single:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>m}}));
import {cancelPendingAttack} from './attackCancellation';
beforeEach(()=>{vi.clearAllMocks();m.update.mockReturnValue(m);m.eq.mockReturnValue(m);m.select.mockReturnValue(m);});
it('cancels only the requested attack and verifies the returned state',async()=>{m.single.mockResolvedValue({data:{id:'attack',state:'canceled'},error:null});await cancelPendingAttack('attack');expect(m.eq).toHaveBeenCalledWith('id','attack');expect(m.update).toHaveBeenCalledWith({state:'canceled'});});
it('surfaces a pending resistance rejection',async()=>{m.single.mockResolvedValue({data:null,error:{message:'Decide Legendary Resistance before canceling this attack.'}});await expect(cancelPendingAttack('attack')).rejects.toThrow('Decide Legendary Resistance');});
it.each([null,{id:'other',state:'canceled'},{id:'attack',state:'applied'}])('does not report unverified cancellation as success: %j',async data=>{m.single.mockResolvedValue({data,error:null});await expect(cancelPendingAttack('attack')).rejects.toThrow('could not be confirmed');});
