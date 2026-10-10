import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn(),guards:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:m.single})})})}}));
vi.mock('./psionicDisciplines',()=>({getPsionicGuardsSaveAdvantage:m.guards}));
import {readAuraSaveState} from './auraSaveState';
const row={participant_type:'character',entity_id:'hero',campaign_id:'camp',encounter_id:'enc',combatants:{active_conditions:['Restrained'],active_buffs:[{name:'Bless'}],exhaustion_level:2}};
beforeEach(()=>{m.guards.mockReset().mockResolvedValue(false);m.single.mockReset().mockResolvedValue({data:row,error:null});});
it('reads canonical combatant effects',async()=>{expect(await readAuraSaveState('camp','enc','actor','WIS')).toEqual({conditions:['Restrained'],buffs:[{name:'Bless'}],exhaustion:2,advantage:false});});
it.each([{data:null,error:null},{data:row,error:{message:'denied'}}])('rejects failed or missing reads %#',async r=>{m.single.mockResolvedValue(r);await expect(readAuraSaveState('camp','enc','actor','WIS')).rejects.toThrow('could not be read');});
it.each([{...row,campaign_id:'other'},{...row,encounter_id:'other'},{...row,combatants:null}])('rejects changed or unlinked targets %#',async data=>{m.single.mockResolvedValue({data,error:null});await expect(readAuraSaveState('camp','enc','actor','WIS')).rejects.toThrow('changed');});
it.each([{exhaustion_level:7},{active_conditions:[4]},{active_buffs:{}}])('rejects malformed effects %#',async patch=>{m.single.mockResolvedValue({data:{...row,combatants:{...row.combatants,...patch}},error:null});await expect(readAuraSaveState('camp','enc','actor','WIS')).rejects.toThrow('Review');});

it('reads live Guards protection for a character Intelligence save',async()=>{
 m.guards.mockResolvedValue(true);expect((await readAuraSaveState('camp','enc','actor','INT')).advantage).toBe(true);expect(m.guards).toHaveBeenCalledWith('hero','INT');
 m.guards.mockResolvedValue(false);expect((await readAuraSaveState('camp','enc','actor','INT')).advantage).toBe(false);
});
it('does not query Guards for other abilities or creature targets',async()=>{
 await readAuraSaveState('camp','enc','actor','WIS');m.single.mockResolvedValue({data:{...row,participant_type:'creature'},error:null});await readAuraSaveState('camp','enc','actor','INT');expect(m.guards).not.toHaveBeenCalled();
});
it('propagates failed Guards verification instead of inventing a normal roll',async()=>{
 m.guards.mockRejectedValue(new Error('Protection unavailable'));await expect(readAuraSaveState('camp','enc','actor','INT')).rejects.toThrow('Protection unavailable');
});
