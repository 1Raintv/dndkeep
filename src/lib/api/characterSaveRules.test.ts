import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.read})})})}}));
import {getCharacterSaveNaturalExtremes} from './characterSaveRules';
beforeEach(()=>mocks.read.mockReset());
it.each([{setting:true,expected:true},{setting:false,expected:false},{setting:null,expected:true}])('preserves existing preference $setting',async({setting,expected})=>{
 mocks.read.mockResolvedValue({data:{nat_1_20_saves:setting},error:null});
 expect(await getCharacterSaveNaturalExtremes('hero')).toBe(expected);
});
it('uses ordinary saves when a character is not visible',async()=>{
 mocks.read.mockResolvedValue({data:null,error:null});
 expect(await getCharacterSaveNaturalExtremes('hero')).toBe(false);
});
it('does not silently substitute a house rule on a failed read',async()=>{
 const error=new Error('offline');mocks.read.mockResolvedValue({data:null,error});
 await expect(getCharacterSaveNaturalExtremes('hero')).rejects.toThrow('offline');
});
