import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn(),from:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:m.from}}));
import {readCreatureSaveDefinition} from './creatureSaveDefinition';
const part={campaign_id:'camp',entity_id:'monster',combatant_id:'cb'};
const cb={campaign_id:'camp',definition_id:'monster',definition_type:'homebrew_monster',owner_id:'owner',stat_block_snapshot:null as unknown};
const row={campaign_id:'camp',ability_scores:{int:18},save_proficiencies:['int'],cr:9};
beforeEach(()=>{m.single.mockReset();m.from.mockReset().mockImplementation(()=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:m.single};return q;});});
function setup(kind:string,definition:unknown,patch:Record<string,unknown>={}){m.single.mockResolvedValueOnce({data:{...cb,definition_type:kind,...patch}}).mockResolvedValue({data:definition});}
it('reads homebrew data from the linked definition',async()=>{setup('homebrew_monster',row);expect(await readCreatureSaveDefinition(part)).toEqual(row);expect(m.from).toHaveBeenLastCalledWith('homebrew_monsters');});
it('reads catalog totals without a homebrew fallback',async()=>{const catalog={owner_id:null,int:18,saving_throws:{int:9}};setup('srd_monster',catalog);expect(await readCreatureSaveDefinition(part)).toEqual(catalog);expect(m.from).toHaveBeenLastCalledWith('monsters');});
it('uses a custom snapshot without another table lookup',async()=>{setup('custom',null,{stat_block_snapshot:{int:18,saving_throws:{int:9}}});expect(await readCreatureSaveDefinition(part)).toEqual({int:18,saving_throws:{int:9}});expect(m.from).toHaveBeenCalledTimes(1);});
it.each(['homebrew_monster','narrative_npc','roster_npc'])('accepts owner-matched unfiled %s',async kind=>{setup(kind,{...row,campaign_id:null,user_id:'owner'});expect(await readCreatureSaveDefinition(part)).not.toBeNull();});
it.each([
 ['homebrew_monster',row,{campaign_id:'other'}],['homebrew_monster',row,{definition_id:'other'}],
 ['homebrew_monster',{...row,campaign_id:'other'},{}],['homebrew_monster',{...row,campaign_id:null,user_id:'other'},{}],
 ['srd_monster',{owner_id:'other'},{}],['srd_monster',null,{}],['custom',null,{}],['custom',null,{stat_block_snapshot:[]}],['unknown',row,{}],
] as const)('rejects unavailable/mismatched %s sources',async(kind,definition,patch)=>{setup(kind,definition,patch);expect(await readCreatureSaveDefinition(part)).toBeNull();});
it('rejects a failed source read even if data was returned',async()=>{m.single.mockResolvedValue({data:cb,error:{message:'denied'}});expect(await readCreatureSaveDefinition(part)).toBeNull();});
it('requires the linked combatant',async()=>{expect(await readCreatureSaveDefinition({...part,combatant_id:null})).toBeNull();expect(m.from).not.toHaveBeenCalled();});

it('preserves imported totals and flat scores',async()=>{
 const imported={...row,int:18,saving_throws:{int:9}};setup('homebrew_monster',imported);expect(await readCreatureSaveDefinition(part)).toEqual(imported);
});
it('NULL totals retain legacy proficiency data',async()=>{
 setup('homebrew_monster',{...row,saving_throws:null});expect(await readCreatureSaveDefinition(part)).toEqual(row);
});
it('unknown imported saves do not become known empty proficiencies',async()=>{
 setup('homebrew_monster',{...row,saving_throws:null,save_proficiencies:null});expect(await readCreatureSaveDefinition(part)).toEqual({...row,save_proficiencies:null});
});
