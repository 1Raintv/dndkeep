import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn(),from:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:m.from}}));
import {readAuraDamageDefenses} from './auraDamageDefenses';
const part={entity_id:'hero',participant_type:'character',campaign_id:'camp',encounter_id:'enc',combatant_id:'combatant'};
const row={campaign_id:'camp',owner_id:'owner',user_id:'owner',species:'Human',species_choices:{},damage_resistances:[' Fire '],damage_immunities:[],damage_vulnerabilities:['fire']};
beforeEach(()=>{m.single.mockReset();m.from.mockReset().mockImplementation(()=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:m.single};return q;});m.single.mockResolvedValueOnce({data:part,error:null}).mockResolvedValue({data:row,error:null});});
const linked=()=>({campaign_id:'camp',definition_type:'homebrew_monster',definition_id:'hero',owner_id:'owner',stat_block_snapshot:null as unknown});
const read=(type:string|null='fire')=>readAuraDamageDefenses('camp','enc','actor',type);
it('normalizes known typed defenses',async()=>{expect(await read()).toEqual({resistant:true,immune:false,vulnerable:true});});
it('adds the chosen species resistance',async()=>{
 m.single.mockReset().mockResolvedValueOnce({data:part,error:null}).mockResolvedValue({data:{...row,species:'Tiefling',species_choices:{tieflingLegacy:'chthonic'}},error:null});expect((await read('necrotic')).resistant).toBe(true);
});
it.each([null,['fire while submerged'],[4]])('does not invent creature defenses from %j',async damage_resistances=>{
 m.single.mockReset().mockResolvedValueOnce({data:{...part,participant_type:'creature'},error:null}).mockResolvedValueOnce({data:linked(),error:null}).mockResolvedValue({data:{...row,damage_resistances},error:null});await expect(read()).rejects.toThrow('Review');
});
it('accepts explicitly empty creature defenses',async()=>{
 m.single.mockReset().mockResolvedValueOnce({data:{...part,participant_type:'creature'},error:null}).mockResolvedValueOnce({data:linked(),error:null}).mockResolvedValue({data:{campaign_id:'camp',damage_resistances:[],damage_immunities:[],damage_vulnerabilities:[]},error:null});expect(await read()).toEqual({resistant:false,immune:false,vulnerable:false});expect(m.from).toHaveBeenLastCalledWith('homebrew_monsters');
});
it('failed reads cannot silently bypass a defense',async()=>{
 m.single.mockReset().mockResolvedValue({data:part,error:{message:'denied'}});await expect(read()).rejects.toThrow('Review');
});
it('rejects a participant from another encounter',async()=>{
 m.single.mockReset().mockResolvedValue({data:{...part,encounter_id:'other'},error:null});await expect(read()).rejects.toThrow('Review');
});
it('does not guess a type for untyped damage',async()=>{expect(await read(null)).toEqual({resistant:false,immune:false,vulnerable:false});});
it('rejects an unknown damage type before reads',async()=>{await expect(read('mystery')).rejects.toThrow('Review');expect(m.from).not.toHaveBeenCalled();});

function creature(kind:string,definition:unknown,patch:Record<string,unknown>={}){
 m.single.mockReset().mockResolvedValueOnce({data:{...part,participant_type:'creature'},error:null})
  .mockResolvedValueOnce({data:{...linked(),definition_type:kind,...patch},error:null}).mockResolvedValue({data:definition,error:null});
}
it('reads catalog defenses only from the public catalog definition',async()=>{
 creature('srd_monster',{...row,owner_id:null});expect(await read()).toEqual({resistant:true,immune:false,vulnerable:true});expect(m.from).toHaveBeenLastCalledWith('monsters');
});
it('reads custom defenses from the linked combatant snapshot',async()=>{
 creature('custom',null,{stat_block_snapshot:row});expect((await read()).resistant).toBe(true);expect(m.from.mock.calls.map(c=>c[0])).toEqual(['combat_participants','combatants']);
});
it.each(['homebrew_monster','narrative_npc','roster_npc'])('accepts owner-matched personal %s definitions',async kind=>{
 creature(kind,{...row,campaign_id:null});expect((await read()).resistant).toBe(true);
});
it.each([
 ['homebrew_monster',{...row,campaign_id:'other'},{}],
 ['homebrew_monster',{...row,campaign_id:null,owner_id:'other',user_id:'other'},{}],
 ['srd_monster',{...row,owner_id:'other'},{}],
 ['custom',null,{stat_block_snapshot:null}],
 ['custom',null,{stat_block_snapshot:{}}],
 ['unknown',row,{}],
 ['homebrew_monster',row,{definition_id:'other'}],
 ['homebrew_monster',row,{campaign_id:'other'}],
] as const)('requires review for a mismatched or unknown %s definition',async(kind,definition,patch)=>{
 creature(kind,definition,patch);await expect(read()).rejects.toThrow('Review');
});
it('does not guess catalog defenses from NULL fields',async()=>{
 creature('srd_monster',{...row,owner_id:null,damage_resistances:null});await expect(read()).rejects.toThrow('Review');
});
