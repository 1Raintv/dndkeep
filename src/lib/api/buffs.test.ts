import {beforeEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({single:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:h.single})})})}}));
import {readCombatantBuffs} from './buffs';
beforeEach(()=>h.single.mockReset());
it('returns the current buff array',async()=>{h.single.mockResolvedValue({data:{active_buffs:[{key:'bless'}]},error:null});expect(await readCombatantBuffs('cb')).toEqual([{key:'bless'}]);});
it('refuses missing or failed reads instead of replacing buffs with an empty array',async()=>{
 h.single.mockResolvedValue({data:null,error:new Error('offline')});await expect(readCombatantBuffs('cb')).rejects.toThrow('offline');
 h.single.mockResolvedValue({data:null,error:null});await expect(readCombatantBuffs('cb')).rejects.toThrow('unavailable');
});
