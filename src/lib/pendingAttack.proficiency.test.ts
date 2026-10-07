import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mocks.from}}));
import {getTargetSaveBonus} from './pendingAttack';
it('loads secondary progression for an automated character saving throw',async()=>{
 const character:Record<string,unknown>={level:3,secondary_class:'Fighter',secondary_level:2,intelligence:18,saving_throw_proficiencies:['intelligence'],nat_1_20_saves:false};
 mocks.from.mockImplementation((table:string)=>{
  let columns='';const q={select:vi.fn((value:string)=>{columns=value;return q;}),eq:vi.fn(()=>q),single:async()=>({data:table==='combat_participants'?{participant_type:'character',entity_id:'psion',campaign_id:'campaign'}:Object.fromEntries(columns.split(',').map(key=>[key.trim(),character[key.trim()]]))})};return q;
 });
 const result=await getTargetSaveBonus('participant','INT');
 expect(result.bonus).toBe(7);expect(result.breakdown).toContain('3 (prof)');expect(result.naturalExtremes).toBe(false);
});
