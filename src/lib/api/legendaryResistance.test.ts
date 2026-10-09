import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:m.rpc,from:m.from}}));
import {decideLegendaryResistance,readEncounterLairBonus} from './legendaryResistance';
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

it.each([null,undefined,''])('no encounter (%s) has no lair bonus',async id=>{
 expect(await readEncounterLairBonus(id)).toBe(0);expect(m.from).not.toHaveBeenCalled();
});
function lairResponse(data:unknown,error:unknown=null){
 m.from.mockReturnValue({select:m.select});m.select.mockReturnValue({eq:m.eq});m.eq.mockReturnValue({maybeSingle:m.maybeSingle});m.maybeSingle.mockResolvedValue({data,error});
}
it.each([true,false])('reads the explicit lair setting (%s)',async in_lair=>{
 lairResponse({in_lair});expect(await readEncounterLairBonus('encounter')).toBe(in_lair?1:0);
 expect(m.from).toHaveBeenCalledWith('combat_encounters');expect(m.select).toHaveBeenCalledWith('in_lair');expect(m.eq).toHaveBeenCalledWith('id','encounter');
});
it('surfaces a lair lookup error even if stale data accompanies it',async()=>{
 lairResponse({in_lair:false},{message:'Connection lost'});await expect(readEncounterLairBonus('encounter')).rejects.toThrow('Connection lost');
});
it.each([null,{}, {in_lair:null},{in_lair:'false'},{in_lair:0}])('rejects missing or malformed lair state (%j)',async data=>{
 lairResponse(data);await expect(readEncounterLairBonus('encounter')).rejects.toThrow('could not be verified');
});
