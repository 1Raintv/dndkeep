import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn(),from:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:m.from}}));
import {readAuraDamageDefenses} from './auraDamageDefenses';
const part={entity_id:'hero',participant_type:'character',campaign_id:'camp',encounter_id:'enc'};
const row={species:'Human',species_choices:{},damage_resistances:[' Fire '],damage_immunities:[],damage_vulnerabilities:['fire']};
beforeEach(()=>{m.single.mockReset();m.from.mockReset().mockImplementation(()=>{const q={select:()=>q,eq:()=>q,single:m.single};return q;});m.single.mockResolvedValueOnce({data:part,error:null}).mockResolvedValue({data:row,error:null});});
const read=(type:string|null='fire')=>readAuraDamageDefenses('camp','enc','actor',type);
it('normalizes known typed defenses',async()=>{expect(await read()).toEqual({resistant:true,immune:false,vulnerable:true});});
it('adds the chosen species resistance',async()=>{
 m.single.mockReset().mockResolvedValueOnce({data:part,error:null}).mockResolvedValue({data:{...row,species:'Tiefling',species_choices:{tieflingLegacy:'chthonic'}},error:null});expect((await read('necrotic')).resistant).toBe(true);
});
it.each([null,['fire while submerged'],[4]])('does not invent creature defenses from %j',async damage_resistances=>{
 m.single.mockReset().mockResolvedValueOnce({data:{...part,participant_type:'creature'},error:null}).mockResolvedValue({data:{...row,damage_resistances},error:null});await expect(read()).rejects.toThrow('Review');
});
it('accepts explicitly empty creature defenses',async()=>{
 m.single.mockReset().mockResolvedValueOnce({data:{...part,participant_type:'creature'},error:null}).mockResolvedValue({data:{damage_resistances:[],damage_immunities:[],damage_vulnerabilities:[]},error:null});expect(await read()).toEqual({resistant:false,immune:false,vulnerable:false});expect(m.from).toHaveBeenLastCalledWith('homebrew_monsters');
});
it('failed reads cannot silently bypass a defense',async()=>{
 m.single.mockReset().mockResolvedValue({data:part,error:{message:'denied'}});await expect(read()).rejects.toThrow('Review');
});
it('rejects a participant from another encounter',async()=>{
 m.single.mockReset().mockResolvedValue({data:{...part,encounter_id:'other'},error:null});await expect(read()).rejects.toThrow('Review');
});
it('does not guess a type for untyped damage',async()=>{expect(await read(null)).toEqual({resistant:false,immune:false,vulnerable:false});});
it('rejects an unknown damage type before reads',async()=>{await expect(read('mystery')).rejects.toThrow('Review');expect(m.from).not.toHaveBeenCalled();});
