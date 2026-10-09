import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:m.rpc}}));
import {decideLegendaryResistance} from './legendaryResistance';
beforeEach(()=>vi.clearAllMocks());
it.each([true,false])('sends one atomic decision (%s)',async accept=>{
 const data={id:'save',pending_lr_decision:false,save_result:accept?'passed':'failed'};m.rpc.mockResolvedValue({data,error:null});
 expect(await decideLegendaryResistance('save',accept)).toEqual(data);
 expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.rpc).toHaveBeenCalledWith('decide_legendary_resistance',{p_attack:'save',p_accept:accept});
});
it('keeps server rejection visible without a client fallback write',async()=>{
 m.rpc.mockResolvedValue({data:null,error:{message:'No charges remain'}});
 await expect(decideLegendaryResistance('save',true)).rejects.toThrow('No charges remain');expect(m.rpc).toHaveBeenCalledTimes(1);
});
it.each([null,{id:'other',pending_lr_decision:false,save_result:'passed'},{id:'save',pending_lr_decision:true,save_result:'passed'},{id:'save',pending_lr_decision:false,save_result:'failed'}])('rejects an unverifiable receipt',async data=>{
 m.rpc.mockResolvedValue({data,error:null});await expect(decideLegendaryResistance('save',true)).rejects.toThrow('could not be verified');
});
